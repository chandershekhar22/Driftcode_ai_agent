import { z } from "zod";

/**
 * The tools the agent may ask for, and the two modes that gate them.
 *
 * Definitions live here rather than on the server because both sides need
 * them: the server describes them to the model, and the CLI executes them
 * against the user's machine. One schema, parsed on both sides.
 */

export const agentModeSchema = z.enum(["plan", "build"]);

/**
 * plan  - read-only. The agent can look at the project and propose work.
 * build - read plus write, edit and shell. The agent can change things.
 */
export type AgentMode = z.infer<typeof agentModeSchema>;

export const DEFAULT_MODE: AgentMode = "plan";

export const toolNameSchema = z.enum([
  "read_file",
  "list_dir",
  "glob",
  "grep",
  "write_file",
  "edit_file",
  "run_command",
]);

export type ToolName = z.infer<typeof toolNameSchema>;

export interface ToolDefinition<TSchema extends z.ZodType = z.ZodType> {
  name: ToolName;
  /** Shown to the model. Written for the model, not for the user. */
  description: string;
  inputSchema: TSchema;
  /** The lowest mode that may use it. */
  mode: AgentMode;
  /** A short past-tense line for the transcript, e.g. "read src/app.tsx". */
  summarize: (input: unknown) => string;
}

/** Best-effort string field read, for summaries that must never throw. */
function field(input: unknown, key: string): string {
  if (input && typeof input === "object" && key in input) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "";
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read a UTF-8 text file from the project. Prefer reading only the range you need by passing startLine and endLine.",
    mode: "plan",
    inputSchema: z.object({
      path: z.string().describe("Path relative to the project root."),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
    }),
    summarize: (input) => `read ${field(input, "path")}`,
  },
  {
    name: "list_dir",
    description:
      "List the entries of a directory in the project. Not recursive - use glob for that.",
    mode: "plan",
    inputSchema: z.object({
      path: z.string().default(".").describe("Path relative to the project root."),
    }),
    summarize: (input) => `list ${field(input, "path") || "."}`,
  },
  {
    name: "glob",
    description:
      "Find files by glob pattern, e.g. src/**/*.ts. Returns paths, not contents.",
    mode: "plan",
    inputSchema: z.object({
      pattern: z.string(),
    }),
    summarize: (input) => `glob ${field(input, "pattern")}`,
  },
  {
    name: "grep",
    description:
      "Search file contents with a regular expression. Returns matching lines with their paths and line numbers.",
    mode: "plan",
    inputSchema: z.object({
      pattern: z.string().describe("A regular expression."),
      glob: z
        .string()
        .optional()
        .describe("Restrict the search, e.g. **/*.ts"),
    }),
    summarize: (input) => `grep ${field(input, "pattern")}`,
  },
  {
    name: "write_file",
    description:
      "Create a file, or replace one entirely. For a small change to an existing file prefer edit_file.",
    mode: "build",
    inputSchema: z.object({
      path: z.string(),
      content: z.string(),
    }),
    summarize: (input) => `write ${field(input, "path")}`,
  },
  {
    name: "edit_file",
    description:
      "Replace an exact stretch of text in a file. oldText must appear exactly once; include enough surrounding context to make it unique.",
    mode: "build",
    inputSchema: z.object({
      path: z.string(),
      oldText: z.string(),
      newText: z.string(),
    }),
    summarize: (input) => `edit ${field(input, "path")}`,
  },
  {
    name: "run_command",
    description:
      "Run a shell command in the project directory and return its output. Use for builds, tests and git.",
    mode: "build",
    inputSchema: z.object({
      command: z.string(),
    }),
    summarize: (input) => `run ${field(input, "command")}`,
  },
] as const;

/** Plan mode gets the read-only tools; build mode gets everything. */
export function toolsForMode(mode: AgentMode): readonly ToolDefinition[] {
  return mode === "build"
    ? TOOLS
    : TOOLS.filter((tool) => tool.mode === "plan");
}

export function findTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

/** Describes a tool call for the transcript without leaning on the schema. */
export function summarizeToolCall(name: string, input: unknown): string {
  const tool = findTool(name);
  if (!tool) return name;

  try {
    return tool.summarize(input);
  } catch {
    return name;
  }
}
