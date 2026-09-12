import { describe, expect, test } from "bun:test";
import type { Message } from "@driftcode/database";

import { buildHistory, buildSafeHistory, unansweredCallIds } from "../lib/history.ts";

/** A stored row, with only the fields history cares about. */
function row(partial: Partial<Message> & { role: Message["role"] }): Message {
  return {
    id: partial.id ?? "m1",
    sessionId: "s1",
    role: partial.role,
    content: partial.content ?? "",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    toolCalls: partial.toolCalls ?? null,
    toolCallId: partial.toolCallId ?? null,
    toolName: partial.toolName ?? null,
  } as Message;
}

const READ_CALL = {
  id: "call_1",
  name: "read_file",
  input: { path: "src/app.ts" },
};

describe("buildHistory", () => {
  test("plain messages pass through as text", () => {
    const history = buildHistory([
      row({ id: "m1", role: "user", content: "hello" }),
      row({ id: "m2", role: "assistant", content: "hi" }),
    ]);

    expect(history).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });

  test("tool calls are replayed structurally, not as prose", () => {
    const history = buildHistory([
      row({ id: "m1", role: "user", content: "what is in app.ts" }),
      row({
        id: "m2",
        role: "assistant",
        content: "Looking.",
        toolCalls: [READ_CALL] as never,
      }),
      row({
        id: "m3",
        role: "tool",
        content: "export const app = 1;",
        toolCallId: "call_1",
        toolName: "read_file",
      }),
    ]);

    expect(history[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Looking." },
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "read_file",
          input: { path: "src/app.ts" },
        },
      ],
    });

    expect(history[2]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_1",
          toolName: "read_file",
          output: { type: "text", value: "export const app = 1;" },
        },
      ],
    });
  });

  test("a turn that was only tool calls carries no empty text part", () => {
    const history = buildHistory([
      row({
        id: "m1",
        role: "assistant",
        content: "",
        toolCalls: [READ_CALL] as never,
      }),
      row({
        id: "m2",
        role: "tool",
        content: "ok",
        toolCallId: "call_1",
        toolName: "read_file",
      }),
    ]);

    const content = history[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    expect(Array.isArray(content) ? content : []).toHaveLength(1);
  });

  test("a tool row missing its call id is dropped rather than sent", () => {
    // A provider rejects a tool result it cannot match to a call.
    const history = buildHistory([
      row({ id: "m1", role: "tool", content: "orphan" }),
      row({ id: "m2", role: "user", content: "hello" }),
    ]);

    expect(history).toEqual([{ role: "user", content: "hello" }]);
  });

  test("garbage in the JSON column is ignored, not fatal", () => {
    const history = buildHistory([
      row({
        id: "m1",
        role: "assistant",
        content: "still readable",
        toolCalls: [{ nonsense: true }, "also nonsense"] as never,
      }),
    ]);

    expect(history).toEqual([
      { role: "assistant", content: "still readable" },
    ]);
  });
});

describe("interrupted turns", () => {
  const interrupted = [
    row({ id: "m1", role: "user", content: "do the thing" }),
    row({
      id: "m2",
      role: "assistant",
      content: "On it.",
      toolCalls: [READ_CALL, { id: "call_2", name: "grep", input: { pattern: "x" } }] as never,
    }),
    // Only the first call ever came back - the CLI was killed mid-turn.
    row({
      id: "m3",
      role: "tool",
      content: "contents",
      toolCallId: "call_1",
      toolName: "read_file",
    }),
  ];

  test("unanswered calls are identified", () => {
    expect([...unansweredCallIds(interrupted)]).toEqual(["call_2"]);
  });

  test("safe history keeps the answered call and drops the abandoned one", () => {
    const history = buildSafeHistory(interrupted);
    const assistant = history[1];
    const content = Array.isArray(assistant?.content) ? assistant.content : [];

    const callIds = content
      .filter((part) => part.type === "tool-call")
      .map((part) => (part as { toolCallId: string }).toolCallId);

    expect(callIds).toEqual(["call_1"]);
    // The result for the surviving call is still there.
    expect(history).toHaveLength(3);
  });

  test("a turn whose every call was abandoned still says something", () => {
    const history = buildSafeHistory([
      row({ id: "m1", role: "user", content: "go" }),
      row({
        id: "m2",
        role: "assistant",
        content: "",
        toolCalls: [READ_CALL] as never,
      }),
    ]);

    // An empty assistant message would be rejected by the provider.
    expect(history[1]).toEqual({
      role: "assistant",
      content: "(tool calls from an interrupted turn were discarded)",
    });
  });

  test("an untouched transcript is left exactly as it is", () => {
    const clean = [
      row({ id: "m1", role: "user", content: "hello" }),
      row({ id: "m2", role: "assistant", content: "hi" }),
    ];

    expect(buildSafeHistory(clean)).toEqual(buildHistory(clean));
  });
});
