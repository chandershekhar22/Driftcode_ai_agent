import { describe, expect, test } from "bun:test";

import { parseArgs } from "../lib/args.ts";

describe("parseArgs", () => {
  test("no arguments means no overrides", () => {
    expect(parseArgs([])).toEqual({ resume: false, help: false, unknown: [] });
  });

  test("reads long and short forms alike", () => {
    expect(parseArgs(["--resume"]).resume).toBe(true);
    expect(parseArgs(["-r"]).resume).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  test("accepts a value as the next argument or after an equals sign", () => {
    expect(parseArgs(["--model", "claude-haiku-4-5"]).model).toBe(
      "claude-haiku-4-5",
    );
    expect(parseArgs(["--model=claude-haiku-4-5"]).model).toBe(
      "claude-haiku-4-5",
    );
    expect(parseArgs(["-m", "claude-sonnet-5"]).model).toBe("claude-sonnet-5");
  });

  test("combines flags", () => {
    const parsed = parseArgs(["-r", "--theme", "ember", "-m", "claude-opus-5"]);

    expect(parsed).toEqual({
      resume: true,
      help: false,
      model: "claude-opus-5",
      theme: "ember",
      unknown: [],
    });
  });

  test("does not swallow the next flag as a value", () => {
    const parsed = parseArgs(["--model", "--resume"]);

    expect(parsed.model).toBeUndefined();
    expect(parsed.resume).toBe(true);
    expect(parsed.unknown).toEqual(["--model (no value given)"]);
  });

  test("reports flags it does not understand instead of ignoring them", () => {
    expect(parseArgs(["--wat", "-x"]).unknown).toEqual(["--wat", "-x"]);
  });
});
