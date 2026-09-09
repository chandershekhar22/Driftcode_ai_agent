import type { Message, Session } from "@driftcode/database";
import type {
  Message as WireMessage,
  SessionSummary as WireSessionSummary,
  Session as WireSession,
} from "@driftcode/shared";

/**
 * Database rows are not wire shapes: dates become ISO strings and the `cwd`
 * column stays server-side. Doing the conversion in one place keeps every route
 * returning exactly what the shared schemas promise.
 */

export function serializeMessage(message: Message): WireMessage {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

export function serializeSessionSummary(
  session: Session,
  messageCount: number,
): WireSessionSummary {
  return {
    id: session.id,
    title: session.title,
    model: session.model,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messageCount,
  };
}

export function serializeSession(
  session: Session & { messages: Message[] },
): WireSession {
  return {
    ...serializeSessionSummary(session, session.messages.length),
    messages: session.messages.map(serializeMessage),
  };
}
