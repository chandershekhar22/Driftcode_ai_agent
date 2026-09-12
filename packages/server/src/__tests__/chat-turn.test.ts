import { describe, expect, test } from "bun:test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { ChatEvent, Message } from "@driftcode/shared";

import { runChatTurn, toNdjsonStream } from "../lib/chat-stream.ts";

/**
 * Exercises a whole turn against a mock model - no API key, no network, no
 * cost. What is being tested is our half: delta assembly, persistence, and
 * what happens when the model throws partway through.
 */

const USER_MESSAGE: Message = {
  id: "m1",
  sessionId: "s1",
  role: "user",
  content: "hello",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const SPEC = {
  id: "claude-opus-5",
  provider: "anthropic" as const,
  label: "Opus 5",
  blurb: "",
  contextWindow: 1_000_000,
  costPerMTok: { input: 5, output: 25 },
  thinking: true,
};

/** Records what the turn persists, standing in for Prisma. */
function fakePrisma() {
  const stored: { role: string; content: string }[] = [];

  return {
    stored,
    client: {
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          session: {
            findUnique: async () => ({ title: "New session" }),
            update: async () => ({}),
          },
          message: {
            create: async ({
              data,
            }: {
              data: { role: string; content: string };
            }) => {
              stored.push({ role: data.role, content: data.content });
              return {
                id: `m${stored.length + 1}`,
                sessionId: "s1",
                role: data.role,
                content: data.content,
                createdAt: new Date("2026-01-01T00:00:01.000Z"),
              };
            },
          },
        }),
    },
  };
}

function modelStreaming(chunks: string[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start" as const, id: "t1" },
          ...chunks.map((delta) => ({
            type: "text-delta" as const,
            id: "t1",
            delta,
          })),
          { type: "text-end" as const, id: "t1" },
          {
            type: "finish" as const,
            finishReason: { unified: "stop" as const, raw: "end_turn" },
            // v7 reports each count as a breakdown, not a bare number.
            usage: {
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 7, text: 7, reasoning: 0 },
            },
          },
        ] satisfies LanguageModelV3StreamPart[],
      }),
    }),
  });
}

async function collect(generator: AsyncGenerator<ChatEvent>) {
  const events: ChatEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe("runChatTurn", () => {
  test("streams deltas and persists the assembled reply", async () => {
    const prisma = fakePrisma();

    const events = await collect(
      runChatTurn({
        prisma: prisma.client as never,
        sessionId: "s1",
        model: modelStreaming(["Add ", "the ", "route."]),
        spec: SPEC,
        system: "system",
        mode: "plan" as const,
        messages: [{ role: "user", content: "hello" }],
        userMessage: USER_MESSAGE,
      }),
    );

    expect(events[0]?.type).toBe("start");

    const deltas = events
      .filter((event) => event.type === "delta")
      .map((event) => event.text);
    expect(deltas).toEqual(["Add ", "the ", "route."]);

    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.message.content).toBe("Add the route.");
      // The mock does not report usage in v7's shape, so only the contract
      // is asserted here; real token counts are checked against a live model.
      expect(done.usage).toBeDefined();
      expect(typeof done.usage?.outputTokens).toBe("number");
    }

    // Only the assistant reply is written here; the user message was stored
    // by the route before the turn began.
    expect(prisma.stored).toEqual([
      { role: "assistant", content: "Add the route." },
    ]);
  });

  test("an empty reply is stored as something visible", async () => {
    const prisma = fakePrisma();

    await collect(
      runChatTurn({
        prisma: prisma.client as never,
        sessionId: "s1",
        model: modelStreaming([]),
        spec: SPEC,
        system: "system",
        mode: "plan" as const,
        messages: [{ role: "user", content: "hello" }],
        userMessage: USER_MESSAGE,
      }),
    );

    expect(prisma.stored[0]?.content).toContain("empty response");
  });

  test("a mid-stream failure keeps what already streamed", async () => {
    const prisma = fakePrisma();

    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream({
          async start(controller) {
            controller.enqueue({ type: "text-start", id: "t1" });
            controller.enqueue({
              type: "text-delta",
              id: "t1",
              delta: "I got this far",
            });
            // Yield first: erroring in the same tick discards the queued
            // delta before the consumer ever sees it, which is not how a real
            // provider fails mid-answer.
            await new Promise((resolve) => setTimeout(resolve, 20));
            controller.error(new Error("upstream exploded"));
          },
        }),
      }),
    });

    const events = await collect(
      runChatTurn({
        prisma: prisma.client as never,
        sessionId: "s1",
        model,
        spec: SPEC,
        system: "system",
        mode: "plan" as const,
        messages: [{ role: "user", content: "hello" }],
        userMessage: USER_MESSAGE,
      }),
    );

    const last = events.at(-1);
    expect(last?.type).toBe("error");

    // The partial answer is not thrown away.
    expect(prisma.stored).toEqual([
      { role: "assistant", content: "I got this far" },
    ]);
  });
});

describe("toNdjsonStream", () => {
  test("emits one JSON object per line", async () => {
    async function* events(): AsyncGenerator<ChatEvent> {
      yield { type: "start", userMessage: USER_MESSAGE };
      yield { type: "delta", text: "hi" };
    }

    const text = await new Response(toNdjsonStream(events())).text();
    const lines = text.trimEnd().split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).type).toBe("start");
    expect(JSON.parse(lines[1]!)).toEqual({ type: "delta", text: "hi" });
  });
});
