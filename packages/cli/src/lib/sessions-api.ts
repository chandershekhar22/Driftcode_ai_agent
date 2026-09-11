import type { ChatEvent } from "@driftcode/shared";
import {
  deletedSchema,
  messageSchema,
  sessionListSchema,
  sessionSchema,
  type CreateSessionInput,
  type Message,
  type MessageRole,
  type Session,
  type SessionSummary,
} from "@driftcode/shared";

import { apiRequest } from "./api-client.ts";
import { streamChat } from "./chat-stream.ts";

/**
 * Everything the UI needs from the sessions API, behind an interface.
 *
 * The interface exists so tests can substitute an in-memory implementation and
 * exercise the screens without a server or a database. Production uses
 * `httpSessions`.
 */
export interface SessionsClient {
  list(): Promise<SessionSummary[]>;
  get(id: string): Promise<Session>;
  create(input: CreateSessionInput): Promise<Session>;
  remove(id: string): Promise<void>;
  appendMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
  ): Promise<Message>;
  /** Sends a turn and streams the reply. */
  chat(
    sessionId: string,
    content: string,
    signal?: AbortSignal,
  ): AsyncIterable<ChatEvent>;
}

export const httpSessions: SessionsClient = {
  async list() {
    const { sessions } = await apiRequest("/sessions", sessionListSchema);
    return sessions;
  },

  get(id) {
    return apiRequest(`/sessions/${id}`, sessionSchema);
  },

  create(input) {
    return apiRequest("/sessions", sessionSchema, {
      method: "POST",
      body: input,
    });
  },

  async remove(id) {
    await apiRequest(`/sessions/${id}`, deletedSchema, { method: "DELETE" });
  },

  chat(sessionId, content, signal) {
    return streamChat(sessionId, content, signal);
  },

  appendMessage(sessionId, role, content) {
    return apiRequest(`/sessions/${sessionId}/messages`, messageSchema, {
      method: "POST",
      body: { role, content },
    });
  },
};
