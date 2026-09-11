import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { resolveModel } from "@driftcode/shared";

import { App } from "../app.tsx";
import { createFakeSessions } from "./fake-sessions.ts";

const CONFIG = {
  version: "0.0.0-test",
  cwd: "C:/projects/demo",
  cwdLabel: "~/projects/demo",
  // The app-wide default. A session may well be using a different model.
  model: resolveModel("claude-opus-5"),
  connection: "connected" as const,
  serverDescription: "test",
};

async function mountSession(model: string, height = 28) {
  const sessions = createFakeSessions();
  const created = await sessions.create({ model, cwd: CONFIG.cwd });

  const setup = await testRender(
    <App
      config={CONFIG}
      initialEntries={[`/session/${created.id}`]}
      sessionsClient={sessions}
      persistConfig={async () => {}}
    />,
    { width: 90, height },
  );

  await setup.flush();
  await new Promise((resolve) => setTimeout(resolve, 40));
  await setup.flush();

  return { ...setup, sessions, created };
}

describe("the status bar", () => {
  test("names the model this session actually uses", async () => {
    const setup = await mountSession("claude-sonnet-5");

    const statusRow = setup
      .captureCharFrame()
      .split("\n")
      .find((line) => line.includes("connected"));

    expect(statusRow).toContain("Sonnet 5");
    expect(statusRow).not.toContain("Opus 5");

    setup.renderer.destroy();
  });
});

describe("the empty transcript", () => {
  test("keeps its lines separate in a short terminal", async () => {
    // A laptop-sized window with the panel squeezed.
    const setup = await mountSession("claude-sonnet-5", 14);

    const frame = setup.captureCharFrame();

    // Each line must be intact rather than painted over the other.
    expect(frame).toContain("Nothing here yet.");
    expect(frame).toContain("Model: Sonnet 5");

    setup.renderer.destroy();
  });
});
