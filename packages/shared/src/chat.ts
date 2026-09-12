import { z } from "zod";

import { messageSchema } from "./schemas.ts";
import { toolNameSchema } from "./tools.ts";

/**
 * The chat stream protocol.
 *
 * The server answers a chat request with newline-delimited JSON: one event per
 * line, each matching `chatEventSchema`. NDJSON rather than raw text because
 * the stream carries more than prose - it names the assistant message that got
 * persisted, and it carries the tool calls the agent wants to make.
 */

export const chatRequestSchema = z.object({
  content: z.string().min(1, "A message cannot be empty."),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** A tool the agent has asked to run. Execution happens on the CLI side. */
export const toolCallSchema = z.object({
  id: z.string(),
  name: toolNameSchema,
  /** Validated against the tool's own schema before it runs. */
  input: z.unknown(),
});

export type ToolCall = z.infer<typeof toolCallSchema>;

/** The outcome of running a tool, sent back so the agent can continue. */
export const toolResultSchema = z.object({
  id: z.string(),
  name: toolNameSchema,
  ok: z.boolean(),
  /** What the model is shown. Truncated by the CLI if enormous. */
  output: z.string(),
  /** One line for the transcript, e.g. "read 120 lines". */
  summary: z.string(),
});

export type ToolResult = z.infer<typeof toolResultSchema>;

/** Body of POST /sessions/:id/tools - continues a turn that asked for tools. */
export const continueChatSchema = z.object({
  results: z.array(toolResultSchema).min(1),
});

export type ContinueChatRequest = z.infer<typeof continueChatSchema>;

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
  /** The agent wants to run a tool. */
  z.object({
    type: z.literal("tool-call"),
    call: toolCallSchema,
  }),
  /** A tool the CLI ran, echoed back once the server has stored it. */
  z.object({
    type: z.literal("tool-result"),
    result: toolResultSchema,
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
    /** True when the turn ended because tools are waiting to run. */
    awaitingTools: z.boolean().optional(),
  }),
  /** The run failed. Whatever text already streamed is still valid. */
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
