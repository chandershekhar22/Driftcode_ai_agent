import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import {
  MODELS,
  findModel,
  keyNameFor,
  type CatalogModel,
  type ModelSpec,
} from "@driftcode/shared";

import { env } from "./env.ts";

/**
 * Turns a model id from the registry into something the AI SDK can run, and
 * reports which models this particular server is able to run at all.
 *
 * The registry owns which models exist; this owns how to reach them and
 * whether they are reachable.
 */

export class ModelUnavailableError extends Error {
  constructor(
    message: string,
    readonly code: "unknown_model" | "missing_api_key",
  ) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/** Every model this server knows about. */
export function allModels(): readonly ModelSpec[] {
  return MODELS;
}

function apiKeyFor(provider: ModelSpec["provider"]): string | undefined {
  return provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
}

export function hasAnyProvider(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
}

/** The catalogue the CLI shows, with unusable models marked rather than hidden. */
export function buildCatalog(): CatalogModel[] {
  return allModels().map((spec) => {
    const available = Boolean(apiKeyFor(spec.provider));

    return {
      id: spec.id,
      provider: spec.provider,
      label: spec.label,
      blurb: spec.blurb,
      thinking: spec.thinking,
      costPerMTok: spec.costPerMTok,
      available,
      ...(available ? {} : { reason: `needs ${keyNameFor(spec.provider)}` }),
    };
  });
}

export function resolveLanguageModel(modelId: string): {
  model: LanguageModel;
  spec: ModelSpec;
} {
  const spec = findModel(modelId);

  if (!spec) {
    throw new ModelUnavailableError(
      `This session uses "${modelId}", which this server cannot run.`,
      "unknown_model",
    );
  }

  const apiKey = apiKeyFor(spec.provider);

  if (!apiKey) {
    // "Nothing is set up" and "this model needs a different key" are different
    // problems: the first needs onboarding, the second is a one-line fix.
    throw new ModelUnavailableError(
      hasAnyProvider()
        ? `${spec.label} needs ${keyNameFor(spec.provider)}. Add it to .env and restart the server.`
        : "No model provider is connected. Add ANTHROPIC_API_KEY (or OPENAI_API_KEY) to .env and restart the server.",
      "missing_api_key",
    );
  }

  if (spec.provider === "anthropic") {
    return { model: createAnthropic({ apiKey })(spec.id), spec };
  }

  return { model: createOpenAI({ apiKey })(spec.id), spec };
}

/**
 * Provider-specific request options.
 *
 * Anthropic models that reason get adaptive thinking - the model decides how
 * much to think per turn. Raise `effort` to "xhigh" here if you want it to try
 * harder on every turn; it costs more tokens.
 */
export function providerOptionsFor(spec: ModelSpec) {
  if (spec.provider === "anthropic" && spec.thinking) {
    return { anthropic: { thinking: { type: "adaptive" as const } } };
  }

  return undefined;
}
