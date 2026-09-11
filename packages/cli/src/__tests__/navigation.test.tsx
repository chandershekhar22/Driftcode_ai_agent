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
  serverDescription: "Connected to driftcode-server v0.0.0-test.",
};

/** Mount the app in a fixed-size fake terminal, backed by an in-memory API. */
async function mount(initialEntries?: string[]) {
  const sessions = createFakeSessions();

  const setup = await testRender(
    <App
      config={CONFIG}
      initialEntries={initialEntries}
      sessionsClient={sessions}
    />,
    { width: 90, height: 28 },
  );

  await setup.flush();
  return { ...setup, sessions };
}

/**
 * A lone ESC byte is held back until the parser can rule out a longer escape
 * sequence, so tests must give it that window before asserting.
 */
async function pressEscape(setup: Awaited<ReturnType<typeof mount>>) {
  setup.mockInput.pressEscape();
  await new Promise((resolve) => setTimeout(resolve, 60));
  await setup.flush();
}

/** Let React commit any pending async state updates, then redraw. */
async function settle(setup: Awaited<ReturnType<typeof mount>>) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await setup.flush();
}

/** Walks home -> model picker -> a live session. */
async function startSession(setup: Awaited<ReturnType<typeof mount>>) {
  setup.mockInput.pressEnter();
  await setup.flush();
  setup.mockInput.pressEnter();
  await setup.waitForFrame((frame) => frame.includes("Nothing here yet"));
}

async function sendMessage(
  setup: Awaited<ReturnType<typeof mount>>,
  text: string,
) {
  await setup.mockInput.typeText(text);
  await setup.flush();
  setup.mockInput.pressEnter();

  // Wait on the backend having stored the whole turn rather than on a frame
  // count - the stream is async, and a frame budget makes the test a race.
  await setup.waitFor(
    () =>
      [...setup.sessions.stored.values()].some((session) =>
        session.messages.some((message) => message.role === "assistant"),
      ),
    { maxPasses: 200 },
  );

  await settle(setup);
}

describe("navigation", () => {
  test("home reports an empty session list", async () => {
    const setup = await mount();

    const frame = await setup.waitForFrame((f) => f.includes("No sessions yet"));
    expect(frame).toContain("Sessions");
    expect(frame).toContain("New session");
    expect(frame).toContain("enter select");

    setup.renderer.destroy();
  });

  test("choosing 'new session' opens the model picker", async () => {
    const setup = await mount();

    setup.mockInput.pressEnter();
    await setup.flush();

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Choose a model");
    expect(frame).toContain("Opus 5");
    expect(frame).toContain("Haiku 4.5");

    setup.renderer.destroy();
  });

  test("picking a model creates a session on the server", async () => {
    const setup = await mount();

    await startSession(setup);

    expect(setup.sessions.stored.size).toBe(1);
    const [created] = [...setup.sessions.stored.values()];
    expect(created?.model).toBe("claude-opus-5");
    // The absolute path is what gets stored, not the shortened label.
    expect(created?.messages).toHaveLength(0);

    setup.renderer.destroy();
  });

  test("a sent message is persisted and shown", async () => {
    const setup = await mount();

    await startSession(setup);
    await sendMessage(setup, "add a login page");

    // A turn stores two messages: the user's and the reply.
    const [session] = [...setup.sessions.stored.values()];
    expect(session?.messages).toHaveLength(2);
    expect(session?.messages[0]?.content).toBe("add a login page");
    expect(session?.messages[1]?.role).toBe("assistant");
    expect(setup.captureCharFrame()).toContain("add a login page");

    setup.renderer.destroy();
  });

  test("a sent message clears the prompt", async () => {
    const setup = await mount();

    await startSession(setup);
    await sendMessage(setup, "first thing");

    // Both the transcript and the prompt draw a "> " caret; the prompt is the
    // last one on screen, just above the status bar.
    const promptRow = setup
      .captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("> "))
      .at(-1);

    expect(promptRow).toBeDefined();
    expect(promptRow).not.toContain("first thing");

    setup.renderer.destroy();
  });

  test("escape returns to the session list", async () => {
    const setup = await mount(["/new"]);

    expect(setup.captureCharFrame()).toContain("Choose a model");

    await pressEscape(setup);

    expect(setup.captureCharFrame()).toContain("Sessions");

    setup.renderer.destroy();
  });

  test("a started session appears in the home list, named by its first message", async () => {
    const setup = await mount();

    await startSession(setup);
    await sendMessage(setup, "rename the button");
    await pressEscape(setup);

    const frame = await setup.waitForFrame((f) =>
      f.includes("rename the button"),
    );
    expect(frame).toContain("2 messages");

    setup.renderer.destroy();
  });

  test("an unknown session id explains itself instead of crashing", async () => {
    const setup = await mount(["/session/nope"]);

    const frame = await setup.waitForFrame((f) =>
      f.includes("No session with that id"),
    );
    expect(frame).toContain("Press esc to go back");

    setup.renderer.destroy();
  });

  test("a server error on load is surfaced, not swallowed", async () => {
    const sessions = createFakeSessions();
    sessions.failNext("Could not reach the driftcode server.");

    const setup = await testRender(
      <App config={CONFIG} sessionsClient={sessions} />,
      { width: 90, height: 28 },
    );

    const frame = await setup.waitForFrame((f) =>
      f.includes("Could not reach"),
    );
    expect(frame).toContain("Could not reach the driftcode server.");

    setup.renderer.destroy();
  });
});
