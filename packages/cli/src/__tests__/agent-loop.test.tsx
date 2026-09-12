import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { resolveModel } from "@driftcode/shared";

import { App } from "../app.tsx";
import { createFakeSessions } from "./fake-sessions.ts";

/**
 * The whole loop, end to end: the agent asks for a tool, the CLI runs it
 * against a real directory, the result goes back, and the agent replies. Only
 * the model is faked - the filesystem work is genuine.
 */

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function project() {
  const root = await mkdtemp(join(tmpdir(), "drift-loop-"));
  dirs.push(root);

  await writeFile(join(root, "notes.md"), "the answer is 42\n", "utf8");
  return root;
}

async function settle(setup: { flush: () => Promise<void> }, ms = 60) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await setup.flush();
}

async function mount(root: string, mode: "plan" | "build" = "plan") {
  const sessions = createFakeSessions();
  const created = await sessions.create({
    model: "claude-opus-5",
    cwd: root,
    mode,
  });

  const setup = await testRender(
    <App
      config={{
        version: "0.0.0-test",
        cwd: root,
        cwdLabel: "~/project",
        model: resolveModel(undefined),
        connection: "connected" as const,
        serverDescription: "test",
      }}
      initialEntries={[`/session/${created.id}`]}
      sessionsClient={sessions}
      persistConfig={async () => {}}
    />,
    { width: 100, height: 30 },
  );

  await setup.flush();
  await settle(setup);

  return { ...setup, sessions, sessionId: created.id, root };
}

async function ask(
  setup: Awaited<ReturnType<typeof mount>>,
  text: string,
  ms = 150,
) {
  await setup.mockInput.typeText(text);
  await setup.flush();
  setup.mockInput.pressEnter();
  await settle(setup, ms);
}

describe("read-only tools", () => {
  test("run without asking, and the agent gets the contents", async () => {
    const root = await project();
    const setup = await mount(root);

    setup.sessions.scriptReply("Let me check.");
    setup.sessions.scriptToolCalls([
      { id: "c1", name: "read_file", input: { path: "notes.md" } },
    ]);
    setup.sessions.scriptFollowUp("The answer is 42.");

    await ask(setup, "what is in notes.md");

    const frame = setup.captureCharFrame();

    // It ran unattended - no approval prompt appeared.
    expect(frame).not.toContain("y to allow");
    // The follow-up proves the result made it back to the agent.
    expect(frame).toContain("The answer is 42.");

    // The real file contents were handed over, not a placeholder.
    const stored = setup.sessions.stored.get(setup.sessionId);
    const toolMessage = stored?.messages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain("the answer is 42");

    setup.renderer.destroy();
  });

  test("a failing tool is reported to the agent rather than crashing", async () => {
    const root = await project();
    const setup = await mount(root);

    setup.sessions.scriptReply("Looking.");
    setup.sessions.scriptToolCalls([
      { id: "c1", name: "read_file", input: { path: "nope.md" } },
    ]);
    setup.sessions.scriptFollowUp("That file does not exist.");

    await ask(setup, "read nope.md");

    expect(setup.captureCharFrame()).toContain("That file does not exist.");

    setup.renderer.destroy();
  });
});

describe("tools that change things", () => {
  test("ask before running", async () => {
    const root = await project();
    const setup = await mount(root, "build");

    setup.sessions.scriptReply("I will add that file.");
    setup.sessions.scriptToolCalls([
      {
        id: "c1",
        name: "write_file",
        input: { path: "new.txt", content: "hello\n" },
      },
    ]);

    await ask(setup, "create new.txt");

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Allow: write new.txt?");
    expect(frame).toContain("y to allow, n to decline");

    // Nothing has been written while the prompt is up.
    await expect(readFile(join(root, "new.txt"), "utf8")).rejects.toThrow();

    setup.renderer.destroy();
  });

  test("y runs it and the file really changes", async () => {
    const root = await project();
    const setup = await mount(root, "build");

    setup.sessions.scriptReply("Adding it.");
    setup.sessions.scriptToolCalls([
      {
        id: "c1",
        name: "write_file",
        input: { path: "new.txt", content: "hello from the agent\n" },
      },
    ]);
    setup.sessions.scriptFollowUp("Done - new.txt created.");

    await ask(setup, "create new.txt");
    setup.mockInput.pressKey("y");
    await settle(setup, 150);

    expect(await readFile(join(root, "new.txt"), "utf8")).toBe(
      "hello from the agent\n",
    );
    expect(setup.captureCharFrame()).toContain("Done - new.txt created.");

    setup.renderer.destroy();
  });

  test("n declines, nothing is written, and the agent is told", async () => {
    const root = await project();
    const setup = await mount(root, "build");

    setup.sessions.scriptReply("I will overwrite it.");
    setup.sessions.scriptToolCalls([
      {
        id: "c1",
        name: "write_file",
        input: { path: "notes.md", content: "clobbered\n" },
      },
    ]);
    setup.sessions.scriptFollowUp("Understood - I left it alone.");

    await ask(setup, "overwrite notes.md");
    setup.mockInput.pressKey("n");
    await settle(setup, 150);

    // The original file is untouched.
    expect(await readFile(join(root, "notes.md"), "utf8")).toBe(
      "the answer is 42\n",
    );

    // And the refusal was reported, so the agent can propose something else.
    const stored = setup.sessions.stored.get(setup.sessionId);
    const toolMessage = stored?.messages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain("declined this tool call");

    expect(setup.captureCharFrame()).toContain("Understood - I left it alone.");

    setup.renderer.destroy();
  });

  test("a shell command also asks first", async () => {
    const root = await project();
    const setup = await mount(root, "build");

    setup.sessions.scriptReply("Running the tests.");
    setup.sessions.scriptToolCalls([
      { id: "c1", name: "run_command", input: { command: "echo hi" } },
    ]);

    await ask(setup, "run the tests");

    expect(setup.captureCharFrame()).toContain("Allow: run echo hi?");

    setup.renderer.destroy();
  });
});

describe("the transcript", () => {
  test("shows each tool as one line, not its output", async () => {
    const root = await project();
    const setup = await mount(root);

    setup.sessions.scriptReply("Checking.");
    setup.sessions.scriptToolCalls([
      { id: "c1", name: "read_file", input: { path: "notes.md" } },
    ]);
    setup.sessions.scriptFollowUp("Read it.");

    await ask(setup, "read notes");

    const frame = setup.captureCharFrame();
    expect(frame).toContain("read notes.md");
    // The file contents belong to the model, not the screen.
    expect(frame).not.toContain("the answer is 42");

    setup.renderer.destroy();
  });
});
