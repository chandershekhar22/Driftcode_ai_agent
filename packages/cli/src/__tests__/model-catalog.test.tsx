import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { resolveModel, type ModelCatalog } from "@driftcode/shared";

import { App } from "../app.tsx";
import { createFakeSessions } from "./fake-sessions.ts";

const NOTHING_CONFIGURED: ModelCatalog = {
  empty: true,
  models: [
    {
      id: "claude-opus-5",
      provider: "anthropic",
      label: "Opus 5",
      blurb: "Deepest reasoning.",
      thinking: true,
      costPerMTok: { input: 5, output: 25 },
      available: false,
      reason: "needs ANTHROPIC_API_KEY",
    },
  ],
};

/**
 * One provider configured, the other not. The registry ships no OpenAI models
 * by default - an operator adds the exact id they want - so this fixture
 * stands in for one they added.
 */
const MIXED: ModelCatalog = {
  empty: false,
  models: [
    {
      id: "claude-opus-5",
      provider: "anthropic",
      label: "Opus 5",
      blurb: "Deepest reasoning.",
      thinking: true,
      costPerMTok: { input: 5, output: 25 },
      available: false,
      reason: "needs ANTHROPIC_API_KEY",
    },
    {
      id: "gpt-5",
      provider: "openai",
      label: "GPT-5",
      blurb: "An OpenAI model the operator added to the registry.",
      thinking: false,
      costPerMTok: { input: 2, output: 8 },
      available: true,
    },
  ],
};

async function mountPicker(catalog: ModelCatalog) {
  const sessions = createFakeSessions();

  const setup = await testRender(
    <App
      config={{
        version: "0",
        cwd: "C:/x",
        cwdLabel: "~/x",
        model: resolveModel(undefined),
        connection: "connected" as const,
        serverDescription: "t",
        catalog,
      }}
      initialEntries={["/new"]}
      sessionsClient={sessions}
      persistConfig={async () => {}}
    />,
    { width: 90, height: 28 },
  );

  await setup.flush();
  await new Promise((resolve) => setTimeout(resolve, 40));
  await setup.flush();

  return { ...setup, sessions };
}

describe("the model picker", () => {
  test("shows why a model cannot be used instead of hiding it", async () => {
    const setup = await mountPicker(NOTHING_CONFIGURED);

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Opus 5 (unavailable)");
    expect(frame).toContain("needs ANTHROPIC_API_KEY");

    setup.renderer.destroy();
  });

  test("warns up front when the server has no provider at all", async () => {
    const setup = await mountPicker(NOTHING_CONFIGURED);

    expect(setup.captureCharFrame()).toContain(
      "no model provider configured",
    );

    setup.renderer.destroy();
  });

  test("refuses to start a session on an unusable model", async () => {
    const setup = await mountPicker(NOTHING_CONFIGURED);

    setup.mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 40));
    await setup.flush();

    // No session is created, and the reason is on screen.
    expect(setup.sessions.stored.size).toBe(0);
    expect(setup.captureCharFrame()).toContain("is not available");

    setup.renderer.destroy();
  });

  test("starts a session on a model that is available", async () => {
    const setup = await mountPicker(MIXED);

    setup.mockInput.pressArrow("down"); // onto the available model
    await new Promise((resolve) => setTimeout(resolve, 40));
    await setup.flush();
    setup.mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await setup.flush();

    expect(setup.sessions.stored.size).toBe(1);
    const [created] = [...setup.sessions.stored.values()];
    expect(created?.model).toBe("gpt-5");

    setup.renderer.destroy();
  });
});
