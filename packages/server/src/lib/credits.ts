import type { ModelSpec } from "@driftcode/shared";

/**
 * What a turn costs, in credits.
 *
 * A credit is a cent of model spend. That keeps the unit honest - a heavy
 * Opus turn costs visibly more than a light Haiku one, because it does - and
 * it means the price list never has to be maintained separately from the model
 * registry, which already carries the rates.
 */

/** USD that one credit represents. */
export const USD_PER_CREDIT = 0.01;

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
}

/** The raw provider cost of a turn, in USD. */
export function usdForUsage(spec: ModelSpec, usage: TurnUsage): number {
  const input = (usage.inputTokens / 1_000_000) * spec.costPerMTok.input;
  const output = (usage.outputTokens / 1_000_000) * spec.costPerMTok.output;

  return input + output;
}

/**
 * Credits to charge for a turn.
 *
 * Rounded up, and never zero: a turn that ran cost something, and charging
 * nothing for it would let a loop of tiny requests run free.
 */
export function creditsForUsage(spec: ModelSpec, usage: TurnUsage): number {
  const usd = usdForUsage(spec, usage);

  if (!Number.isFinite(usd) || usd <= 0) return 1;

  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT));
}

/** "$0.42" - for showing what a balance is worth. */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
