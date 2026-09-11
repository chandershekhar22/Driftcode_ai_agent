import { Hono } from "hono";

import { buildCatalog, hasAnyProvider } from "../lib/models.ts";

/**
 * What this server can run. The CLI shows unavailable models greyed out with
 * the reason attached, rather than hiding them - "Opus 5 needs
 * ANTHROPIC_API_KEY" teaches the user something; a short list teaches nothing.
 */
export const modelsRoute = new Hono().get("/", (c) =>
  c.json({
    models: buildCatalog(),
    empty: !hasAnyProvider(),
  }),
);
