import { afterEach, describe, expect, test } from "bun:test";
import type { ChatEvent } from "@driftcode/shared";

import { ApiClientError } from "../lib/api-client.ts";
import { streamChat } from "../lib/chat-stream.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Serves `body` as the response stream, cut into arbitrary byte chunks. */
function stubFetch(body: string, chunkSize: number, status = 200) {
  globalThis.fetch = (async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(body);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status,
      headers: { "content-type": "application/x-ndjson" },
    });
  }) as unknown as typeof fetch;
}

const USER_MESSAGE = {
  id: "m1",
  sessionId: "s1",
  role: "user" as const,
  content: "hello",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const NDJSON = [
  JSON.stringify({ type: "start", userMessage: USER_MESSAGE }),
  JSON.stringify({ type: "delta", text: "Hel" }),
  JSON.stringify({ type: "delta", text: "lo there" }),
  JSON.stringify({
    type: "done",
    message: { ...USER_MESSAGE, id: "m2", role: "assistant", content: "Hello there" },
  }),
].join("\n");

async function collect(chunkSize: number): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of streamChat("s1", "hello")) events.push(event);
  return events;
}

describe("streamChat", () => {
  test("assembles events regardless of how the bytes are split", async () => {
    // One byte at a time is the worst case: every line is split, and multibyte
    // characters would be torn apart mid-codepoint.
    for (const chunkSize of [1, 3, 17, 4096]) {
      stubFetch(NDJSON, chunkSize);

      const events = await collect(chunkSize);
      const deltas = events
        .filter((event) => event.type === "delta")
        .map((event) => event.text)
        .join("");

      expect(events[0]?.type).toBe("start");
      expect(deltas).toBe("Hello there");
      expect(events.at(-1)?.type).toBe("done");
    }
  });

  test("handles a trailing line with no newline after it", async () => {
    stubFetch(`${JSON.stringify({ type: "delta", text: "tail" })}`, 2);

    const events = await collect(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "delta", text: "tail" });
  });

  test("skips events it does not understand instead of crashing", async () => {
    stubFetch(
      [
        JSON.stringify({ type: "delta", text: "kept" }),
        JSON.stringify({ type: "from_a_newer_server", payload: 1 }),
        "not json at all",
        JSON.stringify({ type: "delta", text: " also kept" }),
      ].join("\n"),
      5,
    );

    const events = await collect(5);
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e.type === "delta" ? e.text : "")).join("")).toBe(
      "kept also kept",
    );
  });

  test("turns a non-2xx response into a readable error", async () => {
    stubFetch(
      JSON.stringify({
        error: { code: "missing_api_key", message: "Opus 5 needs ANTHROPIC_API_KEY." },
      }),
      64,
      400,
    );

    await expect(collect(64)).rejects.toThrow("Opus 5 needs ANTHROPIC_API_KEY.");
  });

  test("reports an unreachable server rather than a fetch failure", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const error = await collect(1).catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe("unreachable");
  });
});
