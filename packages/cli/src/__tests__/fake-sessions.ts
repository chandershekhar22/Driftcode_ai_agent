import type {
  CreateSessionInput,
  Message,
  MessageRole,
  Session,
  SessionSummary,
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
} {
  const stored = new Map<string, Session>();
  let counter = 0;
  let failure: string | null = null;

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
  });

  return {
    stored,

    failNext(message) {
      failure = message;
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
        messages: [],
      };

      stored.set(session.id, session);
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
