import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { resolveModel } from "@driftcode/shared";

import { App } from "../app.tsx";
import { createFakeSessions } from "./fake-sessions.ts";

/** Tests must never write to the real ~/.drift/config.json. */
const noPersist = async () => {};

const CONFIG = {
  version: "0.0.0-test",
  cwd: "C:/projects/demo",
  cwdLabel: "~/projects/demo",
  model: resolveModel(undefined),
  connection: "connected" as const,
  serverDescription: "test",
};

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
      persistConfig={noPersist}
    />,
    { width: 90, height: 28 },
  );

  await setup.flush();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await setup.flush();

  return { ...setup, sessions, sessionId: created.id };
}

async function send(setup: Awaited<ReturnType<typeof mountSession>>, text: string) {
  await setup.mockInput.typeText(text);
  await setup.flush();
  setup.mockInput.pressEnter();

  await setup.waitFor(
    () => (setup.sessions.stored.get(setup.sessionId)?.messages.length ?? 0) >= 1,
    { maxPasses: 200 },
  );

  await new Promise((resolve) => setTimeout(resolve, 40));
  await setup.flush();
}

describe("streaming a reply", () => {
  test("chunks are assembled and shown as one message", async () => {
    const setup = await mountSession();
    // Long enough that the fake splits it into several deltas.
    setup.sessions.scriptReply(
      "Add the route first, then the handler, then a test.",
    );

    await send(setup, "how do I add an endpoint");

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Add the route first");
    expect(frame).toContain("then a test");
    // The caret is only drawn while text is still arriving.
    expect(frame).not.toContain("█");

    setup.renderer.destroy();
  });

  test("the stored transcript holds both halves of the turn", async () => {
    const setup = await mountSession();
    setup.sessions.scriptReply("Use a migration.");

    await send(setup, "how do I change the schema");

    const stored = setup.sessions.stored.get(setup.sessionId);
    expect(stored?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(stored?.messages[1]?.content).toBe("Use a migration.");

    setup.renderer.destroy();
  });

  test("an error mid-stream is shown and the partial reply is kept", async () => {
    const setup = await mountSession();
    setup.sessions.scriptReply("I was partway through when");
    setup.sessions.failChat("The model call failed.");

    await send(setup, "explain this");

    const frame = setup.captureCharFrame();
    expect(frame).toContain("The model call failed.");
    // What already streamed stays on screen rather than vanishing.
    expect(frame).toContain("I was partway through");

    setup.renderer.destroy();
  });

  test("the prompt is usable again after a turn finishes", async () => {
    const setup = await mountSession();
    setup.sessions.scriptReply("Done.");

    await send(setup, "first question");

    const promptRow = setup
      .captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("> "))
      .at(-1);

    // Plan mode is the default, so the prompt invites investigation.
    expect(promptRow).toContain("Ask Opus 5");
    expect(promptRow).not.toContain("Waiting for the reply");

    setup.renderer.destroy();
  });
});

describe("when no model provider is connected", () => {
  test("the failure is visible even though the transcript is empty", async () => {
    const setup = await mountSession();

    // What the server does when no API key is configured: it rejects before
    // storing anything, so the transcript stays empty.
    setup.sessions.failNext(
      "No model provider is connected. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env and restart the server.",
    );

    await setup.mockInput.typeText("hello");
    await setup.flush();
    setup.mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await setup.flush();

    const frame = setup.captureCharFrame();
    expect(frame).toContain("No model provider is connected");
    expect(frame).toContain("ANTHROPIC_API_KEY");

    setup.renderer.destroy();
  });

  test("the prompt becomes usable again so the user can retry", async () => {
    const setup = await mountSession();
    setup.sessions.failNext("nope");

    await setup.mockInput.typeText("hello");
    await setup.flush();
    setup.mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await setup.flush();

    const promptRow = setup
      .captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("> "))
      .at(-1);

    expect(promptRow).not.toContain("Waiting for the reply");

    setup.renderer.destroy();
  });
});
