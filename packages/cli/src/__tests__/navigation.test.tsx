import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { resolveModel } from "@driftcode/shared";

import { App } from "../app.tsx";

const CONFIG = {
  version: "0.0.0-test",
  cwd: "~/projects/demo",
  model: resolveModel(undefined),
  connection: "connected" as const,
  serverDescription: "Connected to driftcode-server v0.0.0-test.",
};

/** Mount the app in a fixed-size fake terminal and settle the first frame. */
async function mount(initialEntries?: string[]) {
  const setup = await testRender(
    <App config={CONFIG} initialEntries={initialEntries} />,
    { width: 90, height: 28 },
  );

  await setup.flush();
  return setup;
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

describe("navigation", () => {
  test("home lists sessions and offers a new one", async () => {
    const { captureCharFrame, renderer } = await mount();

    const frame = captureCharFrame();
    expect(frame).toContain("Sessions");
    expect(frame).toContain("New session");
    expect(frame).toContain("enter select");

    renderer.destroy();
  });

  test("choosing 'new session' opens the model picker", async () => {
    const { captureCharFrame, mockInput, flush, renderer } = await mount();

    mockInput.pressEnter();
    await flush();

    const frame = captureCharFrame();
    expect(frame).toContain("Choose a model");
    expect(frame).toContain("Opus 5");
    expect(frame).toContain("Haiku 4.5");

    renderer.destroy();
  });

  test("picking a model starts a session you can type into", async () => {
    const { captureCharFrame, mockInput, flush, renderer } = await mount();

    mockInput.pressEnter(); // home -> new session
    await flush();
    mockInput.pressEnter(); // pick the highlighted model -> session
    await flush();

    expect(captureCharFrame()).toContain("Nothing here yet");

    await mockInput.typeText("add a login page");
    await flush();
    mockInput.pressEnter();
    await flush();

    const frame = captureCharFrame();
    expect(frame).toContain("add a login page");
    // The stubbed reply stands in for the model until chapter 5.
    expect(frame).toContain("chapter 5");

    renderer.destroy();
  });

  test("a sent message clears the prompt", async () => {
    const setup = await mount();

    setup.mockInput.pressEnter();
    await setup.flush();
    setup.mockInput.pressEnter();
    await setup.flush();

    await setup.mockInput.typeText("first thing");
    await setup.flush();
    setup.mockInput.pressEnter();
    await setup.flush();

    // The prompt row is the one drawn with the caret; it must be empty again.
    // The text still appears elsewhere - in the transcript, and in the panel
    // title, since the first message names the session.
    const promptRow = setup
      .captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("> "))
      .at(-1); // the prompt is the last caret row, below the transcript

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

  test("a started session appears in the home list", async () => {
    const setup = await mount();

    setup.mockInput.pressEnter(); // -> new session
    await setup.flush();
    setup.mockInput.pressEnter(); // -> session
    await setup.flush();
    await setup.mockInput.typeText("rename the button");
    await setup.flush();
    setup.mockInput.pressEnter();
    await setup.flush();

    await pressEscape(setup);

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Sessions");
    // The first message becomes the session's title.
    expect(frame).toContain("rename the button");

    setup.renderer.destroy();
  });

  test("an unknown session id explains itself instead of crashing", async () => {
    const { captureCharFrame, renderer } = await mount(["/session/nope"]);

    expect(captureCharFrame()).toContain("no longer exists");

    renderer.destroy();
  });
});
