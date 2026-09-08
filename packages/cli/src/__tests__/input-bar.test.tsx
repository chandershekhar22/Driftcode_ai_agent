import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";

import { InputBar } from "../components/input-bar.tsx";
import { ThemeProvider } from "../providers/theme/index.tsx";

describe("InputBar", () => {
  test("enter submits the trimmed value and clears the field", async () => {
    const submitted: unknown[] = [];

    const setup = await testRender(
      <ThemeProvider>
        <InputBar onSubmit={(value) => submitted.push(value)} />
      </ThemeProvider>,
      { width: 60, height: 6 },
    );

    await setup.flush();
    await setup.mockInput.typeText("  hello  ");
    await setup.flush();
    setup.mockInput.pressEnter();
    await setup.flush();

    expect(submitted).toEqual(["hello"]);
    expect(setup.captureCharFrame()).not.toContain("hello");

    setup.renderer.destroy();
  });
});
