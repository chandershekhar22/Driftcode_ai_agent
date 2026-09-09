import { z } from "zod";

/**
 * Wire contracts. Every response the server sends has a schema here, and the
 * CLI parses against it rather than trusting the shape - a version skew
 * between the two then surfaces as a clear error instead of `undefined`
 * halfway down a render tree.
 *
 * Timestamps cross the wire as ISO strings; the CLI turns them into dates at
 * the point it needs to format them.
 */

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  protocol: z.number().int(),
  /** Server uptime in seconds, for the CLI's status bar. */
  uptime: z.number(),
  /** False when the server is up but cannot reach Postgres. */
  database: z.boolean(),
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

// --- messages -------------------------------------------------------------

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: z.string(),
});

export type Message = z.infer<typeof messageSchema>;

export const createMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1, "A message cannot be empty."),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

// --- sessions -------------------------------------------------------------

/** A session without its messages - what the list screen needs. */
export const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  model: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number().int().nonnegative(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionSchema = sessionSummarySchema.extend({
  messages: z.array(messageSchema),
});

export type Session = z.infer<typeof sessionSchema>;

export const createSessionSchema = z.object({
  model: z.string().min(1),
  /** Optional - the first user message names the session if this is omitted. */
  title: z.string().max(120).optional(),
  /** Absolute path of the project the agent is pointed at. */
  cwd: z.string().min(1),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const sessionListSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});

export const deletedSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
});
