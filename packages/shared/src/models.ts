/**
 * The models a user can pick from, in the order they are offered.
 *
 * Ids are exact provider model strings - never append a date suffix to an
 * Anthropic id. `costPerMTok` is USD per million tokens and is only used to
 * show what a session is costing; billing is settled server-side in chapter 11.
 *
 * Which of these a given server can actually run depends on the keys it has,
 * so the CLI asks the server (GET /models) rather than assuming this whole
 * list is usable.
 */

export type Provider = "anthropic" | "openai";

export type ModelId =
  | "claude-opus-5"
  | "claude-sonnet-5"
  | "claude-haiku-4-5"
  | (string & {});

export interface ModelSpec {
  id: ModelId;
  provider: Provider;
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
    provider: "anthropic",
    label: "Opus 5",
    blurb: "Deepest reasoning. Best for gnarly refactors and unfamiliar code.",
    contextWindow: 1_000_000,
    costPerMTok: { input: 5, output: 25 },
    thinking: true,
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Sonnet 5",
    blurb: "Balanced. A good default for day-to-day editing.",
    contextWindow: 1_000_000,
    costPerMTok: { input: 2, output: 10 },
    thinking: true,
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Haiku 4.5",
    blurb: "Fastest and cheapest. Good for small, well-specified edits.",
    contextWindow: 200_000,
    costPerMTok: { input: 1, output: 5 },
    thinking: false,
  },
  // To offer an OpenAI model, add it here with provider: "openai" and set
  // OPENAI_API_KEY. The server already routes on `provider`; nothing else
  // needs to change. Ids are deliberately not guessed at here - use the exact
  // string from OpenAI's model list.
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

/** Which env var must be set for a provider to work. */
export function keyNameFor(provider: Provider): string {
  return provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
}
