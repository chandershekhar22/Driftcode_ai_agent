import { describe, expect, test } from "bun:test";
import { toolsForMode } from "@driftcode/shared";

import { buildToolSet } from "../lib/chat-stream.ts";
import { buildSystemPrompt } from "../system-prompt.ts";

const WRITE_TOOLS = ["write_file", "edit_file", "run_command"];

describe("what each mode offers the model", () => {
  test("plan mode offers only read-only tools", () => {
    const names = Object.keys(buildToolSet("plan"));

    expect(names).toContain("read_file");
    expect(names).toContain("grep");

    for (const tool of WRITE_TOOLS) {
      expect(names).not.toContain(tool);
    }
  });

  test("build mode adds the tools that change things", () => {
    const names = Object.keys(buildToolSet("build"));

    for (const tool of WRITE_TOOLS) {
      expect(names).toContain(tool);
    }

    // Everything plan mode had is still there.
    for (const tool of Object.keys(buildToolSet("plan"))) {
      expect(names).toContain(tool);
    }
  });

  test("no tool carries an executor - calls must reach the CLI", () => {
    for (const mode of ["plan", "build"] as const) {
      for (const definition of Object.values(buildToolSet(mode))) {
        // An execute here would run the tool on the server, against the
        // server's filesystem rather than the user's project.
        expect(definition.execute).toBeUndefined();
      }
    }
  });
});

describe("the system prompt", () => {
  test("lists exactly the tools the mode allows", () => {
    const plan = buildSystemPrompt({ cwd: "C:/x", mode: "plan" });

    for (const tool of toolsForMode("plan")) {
      expect(plan).toContain(tool.name);
    }
    for (const tool of WRITE_TOOLS) {
      expect(plan).not.toContain(tool);
    }
  });

  test("tells the agent what it may not do in plan mode", () => {
    const plan = buildSystemPrompt({ cwd: "C:/x", mode: "plan" });

    expect(plan).toContain("PLAN mode");
    expect(plan).toContain("cannot change");
    // The failure worth guarding against is claiming work it could not do.
    expect(plan).toContain("Never claim to have made a change");
  });

  test("names the project directory so paths resolve", () => {
    expect(buildSystemPrompt({ cwd: "C:/projects/demo", mode: "build" })).toContain(
      "C:/projects/demo",
    );
  });
});
