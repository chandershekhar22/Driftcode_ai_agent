import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { configPath, readConfig, writeConfig } from "../lib/config.ts";

const dirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "drift-config-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("config", () => {
  test("a missing file reads as empty rather than throwing", async () => {
    expect(await readConfig(await tempDir())).toEqual({});
  });

  test("round-trips what it stores", async () => {
    const dir = await tempDir();

    await writeConfig({ model: "claude-haiku-4-5", theme: "ember" }, dir);
    expect(await readConfig(dir)).toEqual({
      model: "claude-haiku-4-5",
      theme: "ember",
    });
  });

  test("merges rather than replacing", async () => {
    const dir = await tempDir();

    await writeConfig({ model: "claude-opus-5" }, dir);
    await writeConfig({ theme: "paper" }, dir);

    expect(await readConfig(dir)).toEqual({
      model: "claude-opus-5",
      theme: "paper",
    });
  });

  test("corrupt JSON falls back to empty instead of crashing", async () => {
    const dir = await tempDir();
    await mkdir(dir, { recursive: true });
    await writeFile(configPath(dir), "{ this is not json", "utf8");

    expect(await readConfig(dir)).toEqual({});
  });

  test("a file of the wrong shape falls back to empty", async () => {
    const dir = await tempDir();
    await writeFile(configPath(dir), JSON.stringify({ model: 42 }), "utf8");

    expect(await readConfig(dir)).toEqual({});
  });

  test("keys written by a newer version are ignored, not fatal", async () => {
    const dir = await tempDir();
    await writeFile(
      configPath(dir),
      JSON.stringify({ theme: "ember", somethingNew: { deep: true } }),
      "utf8",
    );

    expect(await readConfig(dir)).toEqual({ theme: "ember" });
  });

  test("leaves no temporary files behind", async () => {
    const dir = await tempDir();
    await writeConfig({ theme: "ember" }, dir);

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir);
    expect(entries).toEqual(["config.json"]);
  });
});
