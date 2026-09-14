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

async function settle(setup: { flush: () => Promise<void> }, ms = 50) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await setup.flush();
}

/** Mounts straight into a session, which is the screen that has a prompt. */
async function mountSession() {
  const sessions = createFakeSessions();
  const created = await sessions.create({
    model: "claude-opus-5",
    cwd: CONFIG.cwd,
  });
  await sessions.appendMessage(created.id, "user", "earlier question");

  const setup = await testRender(
    <App
      config={CONFIG}
      initialEntries={[`/session/${created.id}`]}
      sessionsClient={sessions}
      persistConfig={async () => {}}
      autoDismissToasts={false}
    />,
    { width: 100, height: 30 },
  );

  await setup.flush();
  await settle(setup);

  return { ...setup, sessions, sessionId: created.id };
}

async function mountHome() {
  const sessions = createFakeSessions();
  const created = await sessions.create({
    model: "claude-opus-5",
    cwd: CONFIG.cwd,
  });
  await sessions.appendMessage(created.id, "user", "fix the login page");

  const setup = await testRender(
    <App
      config={CONFIG}
      initialEntries={["/"]}
      sessionsClient={sessions}
      persistConfig={async () => {}}
      autoDismissToasts={false}
    />,
    { width: 100, height: 30 },
  );

  await setup.flush();
  await settle(setup);

  return { ...setup, sessions, sessionId: created.id };
}

describe("the command menu", () => {
  test("a slash in the prompt opens it", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("/");
    await settle(setup);

    const frame = setup.captureCharFrame();
    expect(frame).toContain("/models");
    expect(frame).toContain("/sessions");
    expect(frame).toContain("/theme");

    setup.renderer.destroy();
  });

  test("typing narrows it", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("/mod");
    await settle(setup);

    const frame = setup.captureCharFrame();
    expect(frame).toContain("/models");
    expect(frame).not.toContain("/theme");

    setup.renderer.destroy();
  });

  test("ordinary typing leaves it closed", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("fix the login bug");
    await settle(setup);

    expect(setup.captureCharFrame()).not.toContain("/sessions");

    setup.renderer.destroy();
  });

  test("escape closes it without sending anything", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("/mod");
    await settle(setup);
    setup.mockInput.pressEscape();
    await settle(setup, 80);

    const frame = setup.captureCharFrame();
    expect(frame).not.toContain("/models");
    // Still on the session - escape closed the menu, it did not navigate away.
    expect(frame).toContain("earlier question");

    setup.renderer.destroy();
  });

  test("enter runs the highlighted command", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("/theme");
    await settle(setup);
    setup.mockInput.pressEnter();
    await settle(setup);

    // The theme dialog is open...
    const frame = setup.captureCharFrame();
    expect(frame).toContain("Theme");
    expect(frame).toContain("Midnight");
    // ...and "/theme" is not left behind in the prompt.
    expect(frame).not.toContain("> /theme");

    setup.renderer.destroy();
  });

  test("a command is not also sent to the agent", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("/theme");
    await settle(setup);
    setup.mockInput.pressEnter();
    await settle(setup, 80);

    const stored = setup.sessions.stored.get(setup.sessionId);
    const contents = stored?.messages.map((m) => m.content) ?? [];

    expect(contents).not.toContain("/theme");

    setup.renderer.destroy();
  });

  test("the session list opens it as a dialog instead", async () => {
    const setup = await mountHome();

    setup.mockInput.pressKey("/");
    await settle(setup);

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Commands");
    expect(frame).toContain("/sessions");

    setup.renderer.destroy();
  });
});

describe("dialogs", () => {
  test("search filters the list", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("/sessions");
    await settle(setup);
    setup.mockInput.pressEnter();
    await settle(setup);

    expect(setup.captureCharFrame()).toContain("Sessions");

    // The dialog has its own search box, now focused.
    await setup.mockInput.typeText("nothing matches this");
    await settle(setup);

    expect(setup.captureCharFrame()).toContain("No sessions yet");

    setup.renderer.destroy();
  });

  test("escape closes the dialog and stays on the session", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("/models");
    await settle(setup);
    setup.mockInput.pressEnter();
    await settle(setup);
    expect(setup.captureCharFrame()).toContain("Opus 5");

    setup.mockInput.pressEscape();
    await settle(setup, 80);

    const frame = setup.captureCharFrame();
    // The one keypress closed the dialog. If the screen behind had also acted
    // on it we would be back on the session list instead.
    expect(frame).toContain("earlier question");

    setup.renderer.destroy();
  });

  test("switching mode from the dialog says so", async () => {
    const setup = await mountSession();

    await setup.mockInput.typeText("/agents");
    await settle(setup);
    setup.mockInput.pressEnter();
    await settle(setup);

    // Move onto Build and choose it.
    setup.mockInput.pressArrow("down");
    await settle(setup);
    setup.mockInput.pressEnter();
    await settle(setup, 120);

    expect(setup.sessions.stored.get(setup.sessionId)?.mode).toBe("build");
    expect(setup.captureCharFrame()).toContain("Switched to build mode");

    setup.renderer.destroy();
  });
});
