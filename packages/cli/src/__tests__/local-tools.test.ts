import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ToolPathError, executeToolCall, resolveInside } from "../lib/local-tools.ts";

const dirs: string[] = [];

/** A throwaway project to run tools against. */
async function project() {
  const root = await mkdtemp(join(tmpdir(), "drift-tools-"));
  dirs.push(root);

  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "node_modules", "junk"), { recursive: true });

  await writeFile(
    join(root, "src", "app.ts"),
    ["import { thing } from './thing';", "", "export const app = thing;", ""].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "src", "thing.ts"), "export const thing = 1;\n", "utf8");
  await writeFile(join(root, "README.md"), "# demo\n\nthing lives in src.\n", "utf8");
  await writeFile(
    join(root, "node_modules", "junk", "index.js"),
    "const thing = 'should never be searched';\n",
    "utf8",
  );

  return root;
}

function call(name: string, input: unknown) {
  return { id: `c-${name}`, name: name as never, input };
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("path safety", () => {
  test("a path inside the project resolves", async () => {
    const root = await project();
    expect(resolveInside(root, "src/app.ts")).toContain("app.ts");
  });

  test("climbing out with .. is refused", async () => {
    const root = await project();

    expect(() => resolveInside(root, "../../../etc/passwd")).toThrow(ToolPathError);
    expect(() => resolveInside(root, "src/../../outside.txt")).toThrow(ToolPathError);
  });

  test("an absolute path outside the project is refused", async () => {
    const root = await project();

    expect(() => resolveInside(root, "C:/Windows/System32/config")).toThrow(
      ToolPathError,
    );
    expect(() => resolveInside(root, "/etc/shadow")).toThrow(ToolPathError);
  });

  test("a refused path is a readable result, not a crash", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("read_file", { path: "../../secrets" }));

    expect(result.ok).toBe(false);
    expect(result.output).toContain("outside the project directory");
  });

  test("a write cannot escape the project either", async () => {
    const root = await project();

    const result = await executeToolCall(
      root,
      call("write_file", { path: "../escaped.txt", content: "nope" }),
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("outside the project directory");
  });
});

describe("read_file", () => {
  test("returns the whole file by default", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("read_file", { path: "src/app.ts" }));

    expect(result.ok).toBe(true);
    expect(result.output).toContain("export const app");
    expect(result.summary).toContain("4 lines");
  });

  test("a line range comes back numbered", async () => {
    const root = await project();

    const result = await executeToolCall(
      root,
      call("read_file", { path: "src/app.ts", startLine: 1, endLine: 1 }),
    );

    expect(result.output).toBe("1\timport { thing } from './thing';");
  });

  test("a missing file explains itself", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("read_file", { path: "nope.ts" }));

    expect(result.ok).toBe(false);
    expect(result.summary).toContain("failed");
  });
});

describe("list_dir and glob", () => {
  test("list_dir marks directories", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("list_dir", { path: "." }));

    expect(result.output).toContain("src/");
    expect(result.output).toContain("README.md");
  });

  test("glob finds files by pattern", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("glob", { pattern: "src/**/*.ts" }));

    expect(result.output).toContain("src/app.ts");
    expect(result.output).toContain("src/thing.ts");
  });

  test("glob never returns dependency directories", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("glob", { pattern: "**/*.js" }));

    expect(result.output).not.toContain("node_modules");
  });
});

describe("grep", () => {
  test("reports path and line number", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("grep", { pattern: "export const" }));

    expect(result.output).toContain("src/app.ts:3:");
    expect(result.ok).toBe(true);
  });

  test("skips node_modules even when the pattern would match", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("grep", { pattern: "should never" }));

    expect(result.output).toBe("(no matches)");
  });

  test("an invalid regular expression is a readable failure", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("grep", { pattern: "([unclosed" }));

    expect(result.ok).toBe(false);
    expect(result.output).toContain("not a valid regular expression");
  });
});

describe("write_file", () => {
  test("writes and creates missing directories", async () => {
    const root = await project();

    const result = await executeToolCall(
      root,
      call("write_file", { path: "deep/nested/new.ts", content: "export const x = 1;\n" }),
    );

    expect(result.ok).toBe(true);
    expect(await readFile(join(root, "deep/nested/new.ts"), "utf8")).toContain("x = 1");
  });
});

describe("edit_file", () => {
  test("replaces a unique stretch of text", async () => {
    const root = await project();

    const result = await executeToolCall(
      root,
      call("edit_file", {
        path: "src/thing.ts",
        oldText: "export const thing = 1;",
        newText: "export const thing = 2;",
      }),
    );

    expect(result.ok).toBe(true);
    expect(await readFile(join(root, "src/thing.ts"), "utf8")).toContain("thing = 2");
  });

  test("text that is not present says so, and changes nothing", async () => {
    const root = await project();
    const before = await readFile(join(root, "src/thing.ts"), "utf8");

    const result = await executeToolCall(
      root,
      call("edit_file", { path: "src/thing.ts", oldText: "not here", newText: "x" }),
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Read the file again");
    expect(await readFile(join(root, "src/thing.ts"), "utf8")).toBe(before);
  });

  test("ambiguous text is refused rather than guessed at", async () => {
    const root = await project();
    await writeFile(join(root, "dup.ts"), "const a = 1;\nconst a = 1;\n", "utf8");

    const result = await executeToolCall(
      root,
      call("edit_file", { path: "dup.ts", oldText: "const a = 1;", newText: "const a = 2;" }),
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("appears 2 times");
    // Nothing was changed, so the model can retry with more context.
    expect(await readFile(join(root, "dup.ts"), "utf8")).toBe(
      "const a = 1;\nconst a = 1;\n",
    );
  });
});

describe("run_command", () => {
  test("captures output and a zero exit", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("run_command", { command: "echo hello" }));

    expect(result.ok).toBe(true);
    expect(result.output).toContain("exit 0");
    expect(result.output).toContain("hello");
  });

  test("a failing command is a result, not an exception", async () => {
    const root = await project();

    const result = await executeToolCall(
      root,
      call("run_command", { command: "exit 3" }),
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("exit 3");
  });

  test("runs in the project directory", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("run_command", { command: "ls" }));

    expect(result.output).toContain("README.md");
  });
});

describe("bad input", () => {
  test("a missing required argument is reported against the schema", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("read_file", {}));

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Invalid arguments for read_file");
  });

  test("an unknown tool name is reported rather than thrown", async () => {
    const root = await project();

    const result = await executeToolCall(root, call("launch_missiles", {}));

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Unknown tool");
  });
});

describe("output limits", () => {
  test("a huge file is truncated and says so", async () => {
    const root = await project();
    await writeFile(join(root, "big.txt"), "x".repeat(60_000), "utf8");

    const result = await executeToolCall(root, call("read_file", { path: "big.txt" }));

    expect(result.output.length).toBeLessThan(25_000);
    expect(result.output).toContain("[truncated]");
    expect(result.summary).toContain("truncated");
  });
});
