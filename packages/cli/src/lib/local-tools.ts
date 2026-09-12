import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  findTool,
  type ToolCall,
  type ToolName,
  type ToolResult,
} from "@driftcode/shared";

/**
 * Running the agent's tools against the user's machine.
 *
 * This is the only place in the project that touches the filesystem on the
 * agent's behalf, and it is deliberately paranoid: every path is resolved and
 * checked to be inside the project directory before anything is read or
 * written, and every output is capped so one grep cannot fill the context.
 */

/** Enough for the model to work with, small enough not to swamp the context. */
const MAX_OUTPUT_CHARS = 24_000;
const MAX_LIST_ENTRIES = 300;
const MAX_GREP_MATCHES = 120;
const COMMAND_TIMEOUT_MS = 120_000;

/** Directories never worth searching: noise, and enormous. */
const SKIP_DIRS = /(^|[\\/])(node_modules|\.git|dist|build)([\\/]|$)/;

/**
 * Tool output always uses forward slashes.
 *
 * Bun.Glob yields native separators, so on Windows a scan returns
 * "src\app.ts". Handing the model mixed separators invites it to echo one
 * back, and forward slashes work on every platform we run on.
 */
function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}

export class ToolPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolPathError";
  }
}

/**
 * Resolve a tool-supplied path inside the project.
 *
 * The agent is told paths are relative to the project root, but it is a
 * language model - it will sometimes send an absolute path, or one starting
 * with "..". Both are refused rather than quietly obeyed: an agent that can
 * write outside the project it was pointed at is a much bigger thing than a
 * coding agent.
 */
export function resolveInside(root: string, candidate: string): string {
  const rootResolved = resolve(root);
  const target = isAbsolute(candidate)
    ? resolve(candidate)
    : resolve(rootResolved, candidate);

  const rel = relative(rootResolved, target);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new ToolPathError(
      `"${candidate}" is outside the project directory. Paths must stay inside ${rootResolved}.`,
    );
  }

  return target;
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_OUTPUT_CHARS) return { text, truncated: false };

  return {
    text: `${text.slice(0, MAX_OUTPUT_CHARS)}\n... [truncated]`,
    truncated: true,
  };
}

/** Reads a string argument, with a message the model can act on. */
function str(input: unknown, key: string, fallback?: string): string {
  const value =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)[key]
      : undefined;

  if (typeof value === "string" && value.length > 0) return value;
  if (fallback !== undefined) return fallback;

  throw new Error(`Missing required argument "${key}".`);
}

function num(input: unknown, key: string): number | undefined {
  const value =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)[key]
      : undefined;

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

// --- individual tools -----------------------------------------------------

async function readFileTool(root: string, input: unknown) {
  const path = str(input, "path");
  const target = resolveInside(root, path);
  const contents = await readFile(target, "utf8");

  const startLine = num(input, "startLine");
  const endLine = num(input, "endLine");

  if (startLine === undefined && endLine === undefined) {
    const lines = contents.split("\n").length;
    return { output: contents, summary: `read ${path} (${lines} lines)` };
  }

  const lines = contents.split("\n");
  const from = Math.max((startLine ?? 1) - 1, 0);
  const to = Math.min(endLine ?? lines.length, lines.length);

  // Numbered so the model can refer to a line, and so edits line up.
  const numbered = lines
    .slice(from, to)
    .map((line, index) => `${from + index + 1}\t${line}`)
    .join("\n");

  return { output: numbered, summary: `read ${path} lines ${from + 1}-${to}` };
}

async function listDirTool(root: string, input: unknown) {
  const path = str(input, "path", ".");
  const target = resolveInside(root, path);
  const entries = await readdir(target, { withFileTypes: true });

  const shown = entries.slice(0, MAX_LIST_ENTRIES);
  const lines = shown.map((entry) =>
    entry.isDirectory() ? `${entry.name}/` : entry.name,
  );

  if (entries.length > shown.length) {
    lines.push(`... ${entries.length - shown.length} more`);
  }

  return {
    output: lines.join("\n") || "(empty)",
    summary: `list ${path} (${entries.length} entries)`,
  };
}

async function globTool(root: string, input: unknown) {
  const pattern = str(input, "pattern");
  const glob = new Bun.Glob(pattern);

  const matches: string[] = [];
  for await (const match of glob.scan({ cwd: root, onlyFiles: true })) {
    if (SKIP_DIRS.test(match)) continue;

    matches.push(toPosix(match));
    if (matches.length >= MAX_LIST_ENTRIES) break;
  }

  matches.sort();

  return {
    output: matches.join("\n") || "(no matches)",
    summary: `glob ${pattern} (${matches.length} files)`,
  };
}

async function grepTool(root: string, input: unknown) {
  const pattern = str(input, "pattern");
  const globPattern = str(input, "glob", "**/*");

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    throw new Error(`"${pattern}" is not a valid regular expression.`);
  }

  const glob = new Bun.Glob(globPattern);
  const hits: string[] = [];

  for await (const file of glob.scan({ cwd: root, onlyFiles: true })) {
    if (SKIP_DIRS.test(file)) continue;

    let contents: string;
    try {
      contents = await readFile(join(root, file), "utf8");
    } catch {
      continue; // Binary or unreadable; skip rather than fail the whole search.
    }

    const lines = contents.split("\n");

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";

      if (regex.test(line)) {
        hits.push(`${toPosix(file)}:${index + 1}: ${line.trim()}`);
        if (hits.length >= MAX_GREP_MATCHES) break;
      }
    }

    if (hits.length >= MAX_GREP_MATCHES) break;
  }

  return {
    output: hits.join("\n") || "(no matches)",
    summary: `grep ${pattern} (${hits.length} matches)`,
  };
}

async function writeFileTool(root: string, input: unknown) {
  const path = str(input, "path");
  const content = str(input, "content", "");
  const target = resolveInside(root, path);

  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, content, "utf8");

  const lines = content.split("\n").length;
  return { output: `Wrote ${path} (${lines} lines).`, summary: `write ${path}` };
}

async function editFileTool(root: string, input: unknown) {
  const path = str(input, "path");
  const oldText = str(input, "oldText");
  const newText = str(input, "newText", "");
  const target = resolveInside(root, path);

  const contents = await readFile(target, "utf8");
  const occurrences = contents.split(oldText).length - 1;

  // Both failures are the model's to fix, so say exactly what went wrong.
  if (occurrences === 0) {
    throw new Error(
      `That exact text is not in ${path}. Read the file again - it may differ in whitespace.`,
    );
  }

  if (occurrences > 1) {
    throw new Error(
      `That text appears ${occurrences} times in ${path}. Include more surrounding context so it matches exactly once.`,
    );
  }

  await writeFile(target, contents.replace(oldText, newText), "utf8");

  return { output: `Edited ${path}.`, summary: `edit ${path}` };
}

async function runCommandTool(root: string, input: unknown) {
  const command = str(input, "command");

  const proc = Bun.spawn(["bash", "-lc", command], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => proc.kill(), COMMAND_TIMEOUT_MS);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  clearTimeout(timer);

  // Both streams go to the model: a failing command's message is usually on
  // stderr and is the most useful thing it could read.
  const body = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

  return {
    output: `exit ${exitCode}\n${body || "(no output)"}`,
    summary: `run ${command} (exit ${exitCode})`,
    ok: exitCode === 0,
  };
}

type Runner = (
  root: string,
  input: unknown,
) => Promise<{ output: string; summary: string; ok?: boolean }>;

const RUNNERS: Record<ToolName, Runner> = {
  read_file: readFileTool,
  list_dir: listDirTool,
  glob: globTool,
  grep: grepTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  run_command: runCommandTool,
};

/**
 * Run one tool call and describe what happened.
 *
 * Never throws: a failure is a result the agent can read and react to, and a
 * thrown error here would abandon a turn the user is watching.
 */
export async function executeToolCall(
  root: string,
  call: ToolCall,
): Promise<ToolResult> {
  const definition = findTool(call.name);

  if (!definition) {
    return {
      id: call.id,
      name: call.name,
      ok: false,
      output: `Unknown tool "${call.name}".`,
      summary: `unknown tool ${call.name}`,
    };
  }

  // Validate against the tool's own schema first: a bad argument should be a
  // readable message, not a crash halfway through a write.
  const parsed = definition.inputSchema.safeParse(call.input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      id: call.id,
      name: call.name,
      ok: false,
      output: `Invalid arguments for ${call.name}: ${
        issue ? `${issue.path.join(".")} ${issue.message}` : "see the schema"
      }`,
      summary: `${call.name} (bad arguments)`,
    };
  }

  try {
    const result = await RUNNERS[call.name](root, parsed.data);
    const { text, truncated } = truncate(result.output);

    return {
      id: call.id,
      name: call.name,
      ok: result.ok ?? true,
      output: text,
      summary: truncated ? `${result.summary}, truncated` : result.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      id: call.id,
      name: call.name,
      ok: false,
      output: message,
      summary: `${call.name} failed`,
    };
  }
}
