import type { ModelMessage } from "ai";
import type { Message } from "@driftcode/database";
import { toolCallSchema, type ToolCall } from "@driftcode/shared";

/**
 * Turning a stored transcript back into messages the model understands.
 *
 * Tool calls and their results are replayed structurally rather than as prose.
 * Providers are trained on their own tool format, and a model that sees
 * "I ran read_file and got ..." as plain text loses the link between a call
 * and its result - it starts re-requesting tools it has already run.
 */

/** Stored JSON is only as trustworthy as the row it came from, so it is parsed. */
function readToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const parsed = toolCallSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function buildHistory(messages: readonly Message[]): ModelMessage[] {
  const history: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      history.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "tool") {
      // A tool result with no call to answer would be rejected by the
      // provider, so a row missing its id is dropped rather than sent.
      if (!message.toolCallId || !message.toolName) continue;

      history.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            output: { type: "text", value: message.content },
          },
        ],
      });
      continue;
    }

    // Assistant, and anything unexpected, is treated as assistant text.
    const calls = readToolCalls(message.toolCalls);

    if (calls.length === 0) {
      history.push({ role: "assistant", content: message.content });
      continue;
    }

    history.push({
      role: "assistant",
      content: [
        // Some turns are all tool calls and no prose; an empty text part would
        // be rejected, so it is only included when there is something to say.
        ...(message.content.trim().length > 0
          ? [{ type: "text" as const, text: message.content }]
          : []),
        ...calls.map((call) => ({
          type: "tool-call" as const,
          toolCallId: call.id,
          toolName: call.name,
          input: call.input,
        })),
      ],
    });
  }

  return history;
}

/**
 * Tool calls that were never answered.
 *
 * A provider rejects an assistant turn whose tool calls have no matching
 * results, which is exactly the state left behind when the CLI is killed
 * mid-turn. Those calls are dropped when rebuilding history so an interrupted
 * session can still be resumed.
 */
export function unansweredCallIds(messages: readonly Message[]): Set<string> {
  const requested = new Map<string, string>();
  const answered = new Set<string>();

  for (const message of messages) {
    if (message.role === "tool" && message.toolCallId) {
      answered.add(message.toolCallId);
    }

    for (const call of readToolCalls(message.toolCalls)) {
      requested.set(call.id, message.id);
    }
  }

  const dangling = new Set<string>();
  for (const id of requested.keys()) {
    if (!answered.has(id)) dangling.add(id);
  }

  return dangling;
}

/**
 * History with unanswered tool calls stripped out, so a resumed session is
 * always in a state the provider will accept.
 */
export function buildSafeHistory(messages: readonly Message[]): ModelMessage[] {
  const dangling = unansweredCallIds(messages);

  if (dangling.size === 0) return buildHistory(messages);

  const cleaned: Message[] = messages.map((message) => {
    const calls = readToolCalls(message.toolCalls);
    if (calls.length === 0) return message;

    const kept = calls.filter((call) => !dangling.has(call.id));
    if (kept.length === calls.length) return message;

    return {
      ...message,
      // Prisma types Json loosely; the shape is validated on the way back out.
      toolCalls: (kept.length > 0 ? kept : null) as Message["toolCalls"],
      // A turn that was nothing but abandoned calls still needs something to
      // say, or it becomes an empty assistant message.
      content:
        message.content.trim().length > 0
          ? message.content
          : "(tool calls from an interrupted turn were discarded)",
    };
  });

  return buildHistory(cleaned);
}
