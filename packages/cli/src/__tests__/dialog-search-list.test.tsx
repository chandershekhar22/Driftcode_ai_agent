import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";

import { DialogSearchList, type SearchItem } from "../components/dialog-search-list.tsx";
import { ThemeProvider } from "../providers/theme/index.tsx";

const ITEMS: SearchItem[] = [
  { id: "plan", name: "Plan", description: "Read-only." },
  { id: "build", name: "Build", description: "Can write files." },
  { id: "other", name: "Other", description: "Something else." },
];

async function mount(onSelect: (item: SearchItem) => void) {
  const setup = await testRender(
    <ThemeProvider>
      <DialogSearchList items={ITEMS} onSelect={onSelect} onClose={() => {}} />
    </ThemeProvider>,
    { width: 70, height: 20 },
  );

  await setup.flush();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await setup.flush();

  return setup;
}

describe("DialogSearchList", () => {
  test("lists everything and highlights the first row", async () => {
    const setup = await mount(() => {});

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Plan");
    expect(frame).toContain("Build");
    // Only the highlighted row shows its description.
    expect(frame).toContain("Read-only.");

    setup.renderer.destroy();
  });

  test("down moves the highlight", async () => {
    const setup = await mount(() => {});

    setup.mockInput.pressArrow("down");
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setup.flush();

    expect(setup.captureCharFrame()).toContain("Can write files.");

    setup.renderer.destroy();
  });

  test("enter selects the highlighted row", async () => {
    const chosen: string[] = [];
    const setup = await mount((item) => chosen.push(item.id));

    setup.mockInput.pressArrow("down");
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setup.flush();
    setup.mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setup.flush();

    expect(chosen).toEqual(["build"]);

    setup.renderer.destroy();
  });

  test("typing filters, and enter takes what is left", async () => {
    const chosen: string[] = [];
    const setup = await mount((item) => chosen.push(item.id));

    await setup.mockInput.typeText("buil");
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setup.flush();

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Build");
    expect(frame).not.toContain("Read-only.");

    setup.mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setup.flush();

    expect(chosen).toEqual(["build"]);

    setup.renderer.destroy();
  });

  test("the highlight cannot run off either end", async () => {
    const chosen: string[] = [];
    const setup = await mount((item) => chosen.push(item.id));

    for (let i = 0; i < 6; i++) {
      setup.mockInput.pressArrow("up");
      await setup.flush();
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setup.flush();

    setup.mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setup.flush();

    expect(chosen).toEqual(["plan"]);

    setup.renderer.destroy();
  });
});
