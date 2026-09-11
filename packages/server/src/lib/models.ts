import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { findModel, keyNameFor, type ModelSpec } from "@driftcode/shared";

import { env } from "./env.ts";

/**
 * Turns a model id from the shared registry into something the AI SDK can run.
 *
 * The registry owns which models exist; this owns how to reach them. Adding a
 * model to the registry needs no change here as long as its provider is one we
 * already know.
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

export function resolveLanguageModel(modelId: string): {
  model: LanguageModel;
  spec: ModelSpec;
} {
  const spec = findModel(modelId);

  if (!spec) {
    throw new ModelUnavailableError(
      `This session uses "${modelId}", which is not in the model registry.`,
      "unknown_model",
    );
  }

  const keyName = keyNameFor(spec.provider);
  const apiKey =
    spec.provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new ModelUnavailableError(
      `${spec.label} needs ${keyName}. Add it to .env and restart the server.`,
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
