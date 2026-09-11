import {
  MODELS,
  modelCatalogSchema,
  type CatalogModel,
  type ModelCatalog,
} from "@driftcode/shared";

import { apiRequest } from "./api-client.ts";

/**
 * What the server says it can run.
 *
 * If the server cannot be reached we fall back to the static registry with
 * everything marked available - the UI has to show something, and the chat
 * route reports the real problem the moment a message is sent.
 */
export function fallbackCatalog(): ModelCatalog {
  return {
    models: MODELS.map(
      (spec): CatalogModel => ({
        id: spec.id,
        provider: spec.provider,
        label: spec.label,
        blurb: spec.blurb,
        thinking: spec.thinking,
        costPerMTok: spec.costPerMTok,
        available: true,
      }),
    ),
    empty: false,
  };
}

export async function fetchCatalog(): Promise<ModelCatalog> {
  try {
    return await apiRequest("/models", modelCatalogSchema);
  } catch {
    return fallbackCatalog();
  }
}
