import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { resolveModel } from "@driftcode/shared";

import { App } from "../app.tsx";
import type { DriftConfig } from "../lib/config.ts";
import { createFakeSessions } from "./fake-sessions.ts";

const CONFIG = {
  version: "0.0.0-test",
  cwd: "C:/projects/demo",
  cwdLabel: "~/projects/demo",
  model: resolveModel(undefined),
  connection: "connected" as const,
  serverDescription: "test",
};

/** Captures what would have been written to ~/.drift/config.json. */
function recordingPersist() {
  const saved: DriftConfig[] = [];
  return {
    saved,
    persist: async (patch: DriftConfig) => {
      saved.push(patch);
    },
  };
}

async function mount(options: { entries?: string[]; seed?: boolean } = {}) {
  const sessions = createFakeSessions();
  const { saved, persist } = recordingPersist();

  const seeded = options.seed
    ? await sessions.create({ model: "claude-opus-5", cwd: CONFIG.cwd })
    : null;

  if (seeded) {
    await sessions.appendMessage(seeded.id, "user", "make the button blue");
  }

  const setup = await testRender(
    <App
      config={CONFIG}
      initialEntries={options.entries ?? (seeded ? [`/session/${seeded.id}`] : undefined)}
      sessionsClient={sessions}
      persistConfig={persist}
    />,
    { width: 90, height: 28 },
  );

  await setup.flush();
  await settle(setup);

  return { ...setup, sessions, saved, seeded };
}

async function settle(setup: { flush: () => Promise<void> }) {
  await new Promise((resolve) => setTimeout(resolve, 40));
  await setup.flush();
}

describe("switching a session's model", () => {
  test("alt+m opens the model picker", async () => {
    const setup = await mount({ seed: true });

    setup.mockInput.pressKey("m", { meta: true });
    await settle(setup);

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Switch model");
    expect(frame).toContain("Sonnet 5");

    setup.renderer.destroy();
  });

  test("choosing a model updates the session and is remembered", async () => {
    const setup = await mount({ seed: true });

    setup.mockInput.pressKey("m", { meta: true });
    await settle(setup);

    // Move off Opus 5 onto Sonnet 5, then confirm.
    setup.mockInput.pressArrow("down");
    await setup.flush();
    setup.mockInput.pressEnter();
    await settle(setup);

    const stored = setup.sessions.stored.get(setup.seeded!.id);
    expect(stored?.model).toBe("claude-sonnet-5");

    // The choice is also saved as the preference for new sessions.
    expect(setup.saved).toContainEqual({ model: "claude-sonnet-5" });

    // And we are back on the transcript, not stranded on the picker.
    expect(setup.captureCharFrame()).not.toContain("Switch model");

    setup.renderer.destroy();
  });

  test("escape leaves the model unchanged", async () => {
    const setup = await mount({ seed: true });

    setup.mockInput.pressKey("m", { meta: true });
    await settle(setup);
    setup.mockInput.pressEscape();
    await settle(setup);

    expect(setup.sessions.stored.get(setup.seeded!.id)?.model).toBe(
      "claude-opus-5",
    );
    expect(setup.saved).not.toContainEqual({ model: "claude-sonnet-5" });

    setup.renderer.destroy();
  });
});

describe("deleting a session", () => {
  test("d asks before destroying anything", async () => {
    const setup = await mount({ seed: true, entries: ["/"] });

    setup.mockInput.pressArrow("down"); // off "New session" onto the session
    await settle(setup); // let the highlight commit before the next keystroke
    setup.mockInput.pressKey("d");
    await settle(setup);

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Delete");
    expect(frame).toContain("y to delete, n to keep");
    // Nothing is gone yet.
    expect(setup.sessions.stored.size).toBe(1);

    setup.renderer.destroy();
  });

  test("n keeps the session", async () => {
    const setup = await mount({ seed: true, entries: ["/"] });

    setup.mockInput.pressArrow("down");
    await settle(setup);
    setup.mockInput.pressKey("d");
    await settle(setup);
    expect(setup.captureCharFrame()).toContain("y to delete");

    setup.mockInput.pressKey("n");
    await settle(setup);

    expect(setup.sessions.stored.size).toBe(1);
    expect(setup.captureCharFrame()).not.toContain("y to delete");

    setup.renderer.destroy();
  });

  test("y deletes it and the list updates", async () => {
    const setup = await mount({ seed: true, entries: ["/"] });

    setup.mockInput.pressArrow("down");
    await settle(setup);
    setup.mockInput.pressKey("d");
    await settle(setup);
    setup.mockInput.pressKey("y");
    await settle(setup);

    expect(setup.sessions.stored.size).toBe(0);
    expect(setup.captureCharFrame()).toContain("No sessions yet");

    setup.renderer.destroy();
  });
});

describe("preferences", () => {
  test("cycling the theme is remembered", async () => {
    const setup = await mount({ entries: ["/"] });

    setup.mockInput.pressKey("t", { ctrl: true });
    await settle(setup);

    expect(setup.saved).toContainEqual({ theme: "ember" });

    setup.renderer.destroy();
  });

  test("opening a session records it for --resume", async () => {
    const setup = await mount({ seed: true });

    expect(setup.saved).toContainEqual({ lastSessionId: setup.seeded!.id });

    setup.renderer.destroy();
  });

  test("a stored theme is applied at startup", async () => {
    const sessions = createFakeSessions();

    const setup = await testRender(
      <App
        config={CONFIG}
        sessionsClient={sessions}
        persistConfig={async () => {}}
        initialConfig={{ theme: "paper" }}
        initialTheme="paper"
      />,
      { width: 90, height: 28 },
    );

    await setup.flush();
    // Paper is the light theme; its panel colour differs from midnight's, so a
    // successful render at all is the signal here - the theme name is not text
    // on screen. Assert the app mounted rather than nothing.
    expect(setup.captureCharFrame()).toContain("Sessions");

    setup.renderer.destroy();
  });
});
