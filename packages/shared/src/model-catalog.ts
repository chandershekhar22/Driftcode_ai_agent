import { z } from "zod";

/**
 * What the server can actually run, as opposed to what the registry knows
 * about.
 *
 * The CLI asks for this rather than assuming the static registry is usable:
 * a model with no key configured is worse than absent, because the user only
 * discovers it cannot run after committing a message to it.
 */

export const catalogModelSchema = z.object({
  id: z.string(),
  provider: z.enum(["anthropic", "openai"]),
  label: z.string(),
  blurb: z.string(),
  thinking: z.boolean(),
  costPerMTok: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
  }),
  /** False when the server has no API key for this model's provider. */
  available: z.boolean(),
  /** Why it is unavailable, ready to show the user. */
  reason: z.string().optional(),
});

export type CatalogModel = z.infer<typeof catalogModelSchema>;

export const modelCatalogSchema = z.object({
  models: z.array(catalogModelSchema),
  /** True when nothing at all is configured - the CLI leads with setup help. */
  empty: z.boolean(),
});

export type ModelCatalog = z.infer<typeof modelCatalogSchema>;
