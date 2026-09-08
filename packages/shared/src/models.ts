/**
 * The models a user can pick from, in the order they are offered.
 *
 * Ids are exact Anthropic model strings - never append a date suffix to them.
 * `costPerMTok` is USD per million tokens and is only used to show the user
 * what a session is costing; billing is settled server-side in chapter 11.
 */

export type ModelId = "claude-opus-5" | "claude-sonnet-5" | "claude-haiku-4-5";

export interface ModelSpec {
  id: ModelId;
  label: string;
  /** One line shown next to the name in the model picker. */
  blurb: string;
  contextWindow: number;
  costPerMTok: { input: number; output: number };
  /** Whether the model reasons before answering. Drives the "thinking" UI. */
  thinking: boolean;
}

export const MODELS: readonly ModelSpec[] = [
  {
    id: "claude-opus-5",
    label: "Opus 5",
    blurb: "Deepest reasoning. Best for gnarly refactors and unfamiliar code.",
    contextWindow: 1_000_000,
    costPerMTok: { input: 5, output: 25 },
    thinking: true,
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    blurb: "Balanced. A good default for day-to-day editing.",
    contextWindow: 1_000_000,
    costPerMTok: { input: 2, output: 10 },
    thinking: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    blurb: "Fastest and cheapest. Good for small, well-specified edits.",
    contextWindow: 200_000,
    costPerMTok: { input: 1, output: 5 },
    thinking: false,
  },
] as const;

export const DEFAULT_MODEL: ModelId = "claude-opus-5";

export function findModel(id: string): ModelSpec | undefined {
  return MODELS.find((model) => model.id === id);
}

/** Falls back to the default rather than throwing - a stale config on disk
 *  naming a retired model should not stop the CLI from starting. */
export function resolveModel(id: string | undefined): ModelSpec {
  const match = id ? findModel(id) : undefined;
  return match ?? findModel(DEFAULT_MODEL)!;
}
