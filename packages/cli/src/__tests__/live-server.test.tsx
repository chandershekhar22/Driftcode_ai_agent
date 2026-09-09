import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { resolveModel } from "@driftcode/shared";

import { App } from "../app.tsx";

/**
 * Exercises the real HTTP client against a running server. Skipped unless
 * DRIFT_LIVE=1, so the normal suite stays offline and fast.
 */
const live = process.env.DRIFT_LIVE === "1";

test.if(live)("loads the session list from a live server", async () => {
  const setup = await testRender(
    <App
      config={{
        version: "0.0.0-test",
        cwd: process.cwd(),
        cwdLabel: "~/live",
        model: resolveModel(undefined),
        connection: "connected" as const,
        serverDescription: "live",
      }}
    />,
    { width: 90, height: 28 },
  );

  await setup.flush();

  // waitForFrame counts render passes, which elapse far faster than a real
  // network round trip - poll on wall-clock time instead.
  let frame = setup.captureCharFrame();
  for (let attempt = 0; attempt < 40 && frame.includes("Loading sessions"); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await setup.flush();
    frame = setup.captureCharFrame();
  }

  expect(frame).not.toContain("Loading sessions...");
  setup.renderer.destroy();
});
