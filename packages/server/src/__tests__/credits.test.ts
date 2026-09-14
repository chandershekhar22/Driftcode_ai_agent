import { describe, expect, test } from "bun:test";
import { findModel, type ModelSpec } from "@driftcode/shared";

import { USD_PER_CREDIT, creditsForUsage, usdForUsage } from "../lib/credits.ts";

const OPUS = findModel("claude-opus-5")!;
const HAIKU = findModel("claude-haiku-4-5")!;

describe("what a turn costs", () => {
  test("matches the model's published rates", () => {
    // 1M in at $5 and 1M out at $25 is $30.
    expect(usdForUsage(OPUS, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(30);
  });

  test("scales linearly with tokens", () => {
    const one = usdForUsage(OPUS, { inputTokens: 1000, outputTokens: 500 });
    const two = usdForUsage(OPUS, { inputTokens: 2000, outputTokens: 1000 });

    expect(two).toBeCloseTo(one * 2);
  });

  test("a cheaper model costs less for identical work", () => {
    const usage = { inputTokens: 500_000, outputTokens: 100_000 };

    expect(usdForUsage(HAIKU, usage)).toBeLessThan(usdForUsage(OPUS, usage));
  });
});

describe("charging in credits", () => {
  test("a credit is a cent of model spend", () => {
    // $1.00 of usage is 100 credits.
    const usage = { inputTokens: 200_000, outputTokens: 0 }; // 0.2M * $5 = $1
    expect(usdForUsage(OPUS, usage)).toBeCloseTo(1);
    expect(creditsForUsage(OPUS, usage)).toBe(100);
  });

  test("rounds up, so a fraction of a cent is still charged", () => {
    const usage = { inputTokens: 3000, outputTokens: 100 };
    const usd = usdForUsage(OPUS, usage);

    expect(usd).toBeLessThan(USD_PER_CREDIT * 3);
    expect(creditsForUsage(OPUS, usage)).toBe(Math.ceil(usd / USD_PER_CREDIT));
  });

  test("a tiny turn still costs one credit, never zero", () => {
    // Otherwise a loop of one-token requests would run free.
    expect(creditsForUsage(OPUS, { inputTokens: 1, outputTokens: 0 })).toBe(1);
    expect(creditsForUsage(HAIKU, { inputTokens: 0, outputTokens: 1 })).toBe(1);
  });

  test("a turn that reported no usage still costs one credit", () => {
    // Some providers omit usage. The work happened either way.
    expect(creditsForUsage(OPUS, { inputTokens: 0, outputTokens: 0 })).toBe(1);
  });

  test("nonsense usage does not produce a nonsense charge", () => {
    const broken = { inputTokens: Number.NaN, outputTokens: Number.NaN };

    expect(creditsForUsage(OPUS, broken)).toBe(1);
  });

  test("output is charged at its own higher rate", () => {
    const sameTokens = 100_000;

    const inputOnly = creditsForUsage(OPUS, {
      inputTokens: sameTokens,
      outputTokens: 0,
    });
    const outputOnly = creditsForUsage(OPUS, {
      inputTokens: 0,
      outputTokens: sameTokens,
    });

    // Opus output is five times its input rate.
    expect(outputOnly).toBe(inputOnly * 5);
  });

  test("credits are always whole numbers", () => {
    const samples = [
      { inputTokens: 1, outputTokens: 1 },
      { inputTokens: 1234, outputTokens: 567 },
      { inputTokens: 999_999, outputTokens: 1 },
    ];

    for (const usage of samples) {
      expect(Number.isInteger(creditsForUsage(OPUS, usage))).toBe(true);
    }
  });
});

describe("a model that charges nothing", () => {
  test("still costs a credit a turn", () => {
    const free: ModelSpec = {
      ...OPUS,
      id: "free-model",
      costPerMTok: { input: 0, output: 0 },
    };

    expect(creditsForUsage(free, { inputTokens: 5000, outputTokens: 5000 })).toBe(1);
  });
});
