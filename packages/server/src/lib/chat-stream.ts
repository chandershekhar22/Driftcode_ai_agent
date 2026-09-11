import type { LanguageModel } from "ai";
import { streamText } from "ai";
import type { getPrisma } from "@driftcode/database";
import type { ChatEvent, Message, ModelSpec } from "@driftcode/shared";

import { appendMessage } from "./messages.ts";
import { providerOptionsFor } from "./models.ts";
import { serializeMessage } from "./serialize.ts";

type Prisma = ReturnType<typeof getPrisma>;

/**
 * A cap, not a target - it costs nothing unless the model uses it, and hitting
 * it truncates a reply mid-sentence.
 */
const MAX_OUTPUT_TOKENS = 64_000;

export interface ChatStreamOptions {
  prisma: Prisma;
  sessionId: string;
  model: LanguageModel;
  spec: ModelSpec;
  system: string;
  /** Full conversation including the turn being sent. */
  messages: { role: "user" | "assistant"; content: string }[];
  /** Already stored; echoed back so the client can replace its optimistic row. */
  userMessage: Message;
}

/**
 * Runs one turn and yields the events the CLI consumes.
 *
 * Kept out of the route so it can be exercised against a mock model - the
 * route is then only wiring, and the interesting behaviour (assembling deltas,
 * persisting the reply, surviving a mid-stream failure) is testable without an
 * API key or a network call.
 */
export async function* runChatTurn(
  options: ChatStreamOptions,
): AsyncGenerator<ChatEvent> {
  const { prisma, sessionId, model, spec, system, messages } = options;

  yield { type: "start", userMessage: options.userMessage };

  let text = "";

  try {
    const result = streamText({
      model,
      system,
      messages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      providerOptions: providerOptionsFor(spec),
    });

    for await (const delta of result.textStream) {
      text += delta;
      yield { type: "delta", text: delta };
    }

    const usage = await result.usage;

    // An empty reply is still a turn, but storing an empty message would
    // render as a blank bubble - say something instead.
    const finalText =
      text.trim().length > 0 ? text : "(the model returned an empty response)";

    const assistantMessage = await appendMessage(
      prisma,
      sessionId,
      "assistant",
      finalText,
    );

    yield {
      type: "done",
      message: serializeMessage(assistantMessage),
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
    };
  } catch (error) {
    console.error("Chat stream failed:", error);

    // Keep whatever streamed - a truncated answer beats losing it.
    if (text.trim().length > 0) {
      await appendMessage(prisma, sessionId, "assistant", text).catch(
        () => null,
      );
    }

    yield {
      type: "error",
      code: "model_error",
      message: error instanceof Error ? error.message : "The model call failed.",
    };
  }
}

/** Serializes an event stream as newline-delimited JSON. */
export function toNdjsonStream(
  events: AsyncGenerator<ChatEvent>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } finally {
        controller.close();
      }
    },
  });
}
