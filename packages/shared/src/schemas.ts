import { z } from "zod";

/**
 * Wire contracts. Every response the server sends has a schema here, and the
 * CLI parses against it rather than trusting the shape - a version skew
 * between the two then surfaces as a clear error instead of `undefined`
 * halfway down a render tree.
 */

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  protocol: z.number().int(),
  /** Server uptime in seconds, for the CLI's status bar. */
  uptime: z.number(),
});

export type Health = z.infer<typeof healthSchema>;

/** Shape of every error the server returns, so the CLI can render one
 *  consistent error message regardless of which route failed. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
