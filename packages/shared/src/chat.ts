import { z } from "zod";

import { messageSchema } from "./schemas.ts";

/**
 * The chat stream protocol.
 *
 * The server answers a chat request with newline-delimited JSON: one event per
 * line, each matching `chatEventSchema`. NDJSON rather than raw text because
 * the stream carries more than prose - it has to name the assistant message
 * that got persisted, and in chapter 7 it will carry tool calls too.
 */

export const chatRequestSchema = z.object({
  content: z.string().min(1, "A message cannot be empty."),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatEventSchema = z.discriminatedUnion("type", [
  /** The user message was stored; the assistant is about to speak. */
  z.object({
    type: z.literal("start"),
    userMessage: messageSchema,
  }),
  /** A chunk of assistant text. Append it to what came before. */
  z.object({
    type: z.literal("delta"),
    text: z.string(),
  }),
  /** The assistant finished and its message was persisted. */
  z.object({
    type: z.literal("done"),
    message: messageSchema,
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
      })
      .optional(),
  }),
  /** The run failed. Whatever text already streamed is still valid. */
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
