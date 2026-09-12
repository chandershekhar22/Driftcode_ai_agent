import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { resolveModel } from "@driftcode/shared";

import { App } from "../app.tsx";
import { createFakeSessions } from "./fake-sessions.ts";

const CONFIG = {
  version: "0.0.0-test",
  cwd: "C:/projects/demo",
  cwdLabel: "~/projects/demo",
  model: resolveModel(undefined),
  connection: "connected" as const,
  serverDescription: "test",
};

async function settle(setup: { flush: () => Promise<void> }, ms = 40) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await setup.flush();
}

async function mountSession() {
  const sessions = createFakeSessions();
  const created = await sessions.create({
    model: "claude-opus-5",
    cwd: CONFIG.cwd,
  });

  const setup = await testRender(
    <App
      config={CONFIG}
      initialEntries={[`/session/${created.id}`]}
      sessionsClient={sessions}
      persistConfig={async () => {}}
    />,
    { width: 90, height: 28 },
  );

  await setup.flush();
  await settle(setup);

  return { ...setup, sessions, sessionId: created.id };
}

describe("agent modes", () => {
  test("a session starts in plan mode", async () => {
    const setup = await mountSession();

    const frame = setup.captureCharFrame();
    expect(frame).toContain("PLAN");
    expect(frame).toContain("Plan mode - read-only");

    setup.renderer.destroy();
  });

  test("shift+tab switches to build and back", async () => {
    const setup = await mountSession();

    setup.mockInput.pressTab({ shift: true });
    await settle(setup, 60);

    expect(setup.captureCharFrame()).toContain("BUILD");
    expect(setup.sessions.stored.get(setup.sessionId)?.mode).toBe("build");

    setup.mockInput.pressTab({ shift: true });
    await settle(setup, 60);

    expect(setup.captureCharFrame()).toContain("PLAN");
    expect(setup.sessions.stored.get(setup.sessionId)?.mode).toBe("plan");

    setup.renderer.destroy();
  });

  test("the prompt reflects what the mode allows", async () => {
    const setup = await mountSession();

    expect(setup.captureCharFrame()).toContain("Ask Opus 5 to look into");

    setup.mockInput.pressTab({ shift: true });
    await settle(setup, 60);

    expect(setup.captureCharFrame()).toContain("Tell Opus 5 what to build");

    setup.renderer.destroy();
  });
});

describe("tool calls", () => {
  test("are shown as readable lines, not raw JSON", async () => {
    const setup = await mountSession();

    setup.sessions.scriptReply("Let me look at that.");
    setup.sessions.scriptToolCalls([
      { id: "c1", name: "read_file", input: { path: "src/app.tsx" } },
      { id: "c2", name: "grep", input: { pattern: "useSession" } },
    ]);

    await setup.mockInput.typeText("where is the session hook");
    await setup.flush();
    setup.mockInput.pressEnter();
    await settle(setup, 80);

    const frame = setup.captureCharFrame();
    expect(frame).toContain("read src/app.tsx");
    expect(frame).toContain("grep useSession");
    // The argument object itself must not be dumped into the transcript.
    expect(frame).not.toContain('{"path"');

    setup.renderer.destroy();
  });

  test("a turn with no prose still records what was asked for", async () => {
    const setup = await mountSession();

    setup.sessions.scriptReply("");
    setup.sessions.scriptToolCalls([
      { id: "c1", name: "list_dir", input: { path: "packages" } },
    ]);

    await setup.mockInput.typeText("what is in packages");
    await setup.flush();
    setup.mockInput.pressEnter();
    await settle(setup, 80);

    expect(setup.captureCharFrame()).toContain("list packages");

    setup.renderer.destroy();
  });
});
