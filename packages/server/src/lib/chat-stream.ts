import type { LanguageModel, ModelMessage, ToolSet } from "ai";
import { streamText, tool } from "ai";
import type { getPrisma } from "@driftcode/database";
import {
  summarizeToolCall,
  toolsForMode,
  type AgentMode,
  type ChatEvent,
  type Message,
  type ModelSpec,
  type ToolCall,
  type ToolName,
} from "@driftcode/shared";

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
  /** Full conversation including the turn being sent, in model form. */
  messages: ModelMessage[];
  /** Decides which tools the agent is offered. */
  mode: AgentMode;
  /**
   * Called once a turn has finished, with what it consumed. A callback so this
   * file knows nothing about billing - it reports, someone else charges.
   */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
  /**
   * Already stored; echoed back so the client can replace its optimistic row.
   * Absent when continuing a turn after tool results, which adds no new user
   * message.
   */
  userMessage?: Message;
}

/**
 * The tools offered to the model for a given mode.
 *
 * None of them carry an `execute`: the agent runs on the server but the files
 * live on the user's machine, so a call has to travel back to the CLI. Leaving
 * `execute` off makes the SDK surface the call to us instead of running it.
 */
export function buildToolSet(mode: AgentMode): ToolSet {
  const entries = toolsForMode(mode).map((definition) => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
    }),
  ]);

  return Object.fromEntries(entries) as ToolSet;
}

/** What the transcript records when a turn ends in tool calls. */
function describeCalls(calls: ToolCall[]): string {
  return calls
    .map((call) => `- ${summarizeToolCall(call.name, call.input)}`)
    .join("\n");
}

/**
 * Runs one turn and yields the events the CLI consumes.
 *
 * Kept out of the route so it can be exercised against a mock model - the
 * route is then only wiring, and the interesting behaviour (assembling deltas,
 * surfacing tool calls, persisting the reply, surviving a mid-stream failure)
 * is testable without an API key or a network call.
 */
export async function* runChatTurn(
  options: ChatStreamOptions,
): AsyncGenerator<ChatEvent> {
  const { prisma, sessionId, model, spec, system, messages, mode } = options;

  if (options.userMessage) {
    yield { type: "start", userMessage: options.userMessage };
  }

  let text = "";
  const calls: ToolCall[] = [];

  try {
    const result = streamText({
      model,
      system,
      messages,
      tools: buildToolSet(mode),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      providerOptions: providerOptionsFor(spec),
    });

    // fullStream rather than textStream: a turn can contain tool calls as well
    // as prose, and textStream would silently drop them.
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        text += part.text;
        yield { type: "delta", text: part.text };
        continue;
      }

      if (part.type === "tool-call") {
        const call: ToolCall = {
          id: part.toolCallId,
          name: part.toolName as ToolName,
          input: part.input,
        };

        calls.push(call);
        yield { type: "tool-call", call };
      }
    }

    const usage = await result.usage;

    options.onUsage?.({
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    });

    // A turn is still a turn when it is all tool calls and no prose - record
    // what was asked for so the transcript is not a blank bubble.
    const finalText =
      text.trim().length > 0
        ? text
        : calls.length > 0
          ? describeCalls(calls)
          : "(the model returned an empty response)";

    const assistantMessage = await appendMessage(
      prisma,
      sessionId,
      "assistant",
      finalText,
      // Stored structurally so the next request can replay them to the model
      // and match each one to its result.
      calls.length > 0 ? { toolCalls: calls } : {},
    );

    yield {
      type: "done",
      message: serializeMessage(assistantMessage),
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
      ...(calls.length > 0 ? { awaitingTools: true } : {}),
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
