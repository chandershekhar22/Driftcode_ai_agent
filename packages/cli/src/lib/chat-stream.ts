import type { ToolResult } from "@driftcode/shared";
import {
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  apiErrorSchema,
  chatEventSchema,
  type ChatEvent,
} from "@driftcode/shared";

import { ApiClientError, apiUrl } from "./api-client.ts";

/**
 * Consumes the chat route's newline-delimited JSON stream.
 *
 * Yields one validated event at a time. Anything the server sends that does not
 * match the shared schema is dropped rather than crashing the transcript - a
 * newer server adding an event type should not break an older client.
 */
export function streamChat(
  sessionId: string,
  content: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  return streamNdjson(`/sessions/${sessionId}/chat`, { content }, signal);
}

/** Reports tool results and streams whatever the agent does next. */
export function streamToolResults(
  sessionId: string,
  results: ToolResult[],
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  return streamNdjson(`/sessions/${sessionId}/tools`, { results }, signal);
}

async function* streamNdjson(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  let response: Response;

  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiClientError(
      `Could not reach the driftcode server at ${apiUrl}. Is it running?`,
      "unreachable",
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const parsed = apiErrorSchema.safeParse(body);

    throw new ApiClientError(
      parsed.success ? parsed.data.error.message : response.statusText,
      parsed.success ? parsed.data.error.code : "unknown",
      response.status,
    );
  }

  if (!response.body) {
    throw new ApiClientError("The server sent no stream.", "empty_stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // A chunk can split a line anywhere, so only complete lines are parsed
      // and the remainder is carried into the next read.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseEvent(line);
        if (event) yield event;
      }
    }

    const trailing = parseEvent(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(line: string): ChatEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed = chatEventSchema.safeParse(JSON.parse(trimmed));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
