import type {
  ChatEvent,
  ToolCall,
  ToolResult,
  CreateSessionInput,
  Message,
  MessageRole,
  Session,
  SessionSummary,
  UpdateSessionInput,
} from "@driftcode/shared";

import type { SessionsClient } from "../lib/sessions-api.ts";

/**
 * An in-memory stand-in for the sessions API.
 *
 * It mirrors the server's behaviour that the UI depends on: ordering by most
 * recently touched, and the first user message naming the session. Tests that
 * care about those rules are then testing the UI's use of them, and the
 * server's own rules are covered by the server's tests.
 */
export function createFakeSessions(): SessionsClient & {
  readonly stored: Map<string, Session>;
  failNext: (message: string) => void;
  /** What the fake model will stream on the next chat turn. */
  scriptReply: (text: string) => void;
  /** Make the next chat turn emit an error event partway through. */
  failChat: (message: string) => void;
  /** Tool calls the fake agent will request on the next turn. */
  scriptToolCalls: (calls: ToolCall[]) => void;
  /** What the fake agent says after it receives tool results. */
  scriptFollowUp: (text: string) => void;
} {
  const stored = new Map<string, Session>();
  let counter = 0;
  let failure: string | null = null;
  let reply = "Sure - here is what I would do.";
  let chatFailure: string | null = null;
  let pendingCalls: ToolCall[] = [];
  let followUp: string | null = null;

  const check = () => {
    if (failure) {
      const message = failure;
      failure = null;
      throw new Error(message);
    }
  };

  const summarize = (session: Session): SessionSummary => ({
    id: session.id,
    title: session.title,
    model: session.model,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    mode: session.mode,
  });

  return {
    stored,

    failNext(message) {
      failure = message;
    },

    scriptReply(text) {
      reply = text;
    },

    failChat(message) {
      chatFailure = message;
    },

    scriptToolCalls(calls) {
      pendingCalls = calls;
    },

    scriptFollowUp(text) {
      followUp = text;
    },

    async *chat(sessionId: string, content: string): AsyncGenerator<ChatEvent> {
      check();

      const userMessage = await this.appendMessage(sessionId, "user", content);
      yield { type: "start", userMessage };

      // Split into a few chunks so tests exercise incremental assembly rather
      // than a single delta that happens to be the whole reply.
      const chunks = reply.match(/.{1,8}/gs) ?? [];
      let text = "";

      for (const chunk of chunks) {
        text += chunk;
        yield { type: "delta", text: chunk };
      }

      for (const call of pendingCalls) {
        yield { type: "tool-call", call };
      }
      pendingCalls = [];

      if (chatFailure) {
        const message = chatFailure;
        chatFailure = null;

        // The server stores whatever streamed before a failure, so the fake
        // does too - otherwise a reload would wipe the partial reply and the
        // test would be asserting something the real server does not do.
        if (text.length > 0) {
          await this.appendMessage(sessionId, "assistant", text);
        }

        yield { type: "error", code: "model_error", message };
        return;
      }

      const assistantMessage = await this.appendMessage(
        sessionId,
        "assistant",
        text,
      );

      yield { type: "done", message: assistantMessage };
    },

    async list() {
      check();
      return [...stored.values()]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map(summarize);
    },

    async get(id) {
      check();
      const session = stored.get(id);
      if (!session) throw new Error("No session with that id.");
      return structuredClone(session);
    },

    async create(input: CreateSessionInput) {
      check();
      const now = new Date(Date.now() + counter).toISOString();
      const session: Session = {
        id: `s${++counter}`,
        title: input.title ?? "New session",
        model: input.model,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        mode: input.mode ?? "plan",
        messages: [],
      };

      stored.set(session.id, session);
      return structuredClone(session);
    },

    /** Streams whatever was scripted for the continuation after tools. */
    async *continueWithToolResults(sessionId: string, results: ToolResult[]) {
      check();

      for (const result of results) {
        await this.appendMessage(sessionId, "tool", result.output);
        yield { type: "tool-result" as const, result };
      }

      const text = followUp;
      followUp = null;

      if (text) {
        yield { type: "delta" as const, text };
        const message = await this.appendMessage(sessionId, "assistant", text);
        yield { type: "done" as const, message };
      }
    },

    async update(id: string, input: UpdateSessionInput) {
      check();
      const session = stored.get(id);
      if (!session) throw new Error("No session with that id.");

      if (input.model !== undefined) session.model = input.model;
      if (input.title !== undefined) session.title = input.title;
      if (input.mode !== undefined) session.mode = input.mode;

      return structuredClone(session);
    },

    async remove(id) {
      check();
      stored.delete(id);
    },

    async appendMessage(sessionId: string, role: MessageRole, content: string) {
      check();
      const session = stored.get(sessionId);
      if (!session) throw new Error("No session with that id.");

      const message: Message = {
        id: `m${++counter}`,
        sessionId,
        role,
        content,
        createdAt: new Date(Date.now() + counter).toISOString(),
      };

      if (session.messages.length === 0 && role === "user") {
        session.title = content.split("\n")[0]?.trim() ?? session.title;
      }

      session.messages.push(message);
      session.messageCount = session.messages.length;
      session.updatedAt = message.createdAt;

      return structuredClone(message);
    },
  };
}
