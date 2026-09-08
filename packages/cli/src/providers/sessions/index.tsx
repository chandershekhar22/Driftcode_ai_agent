import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ModelId } from "@driftcode/shared";

/**
 * In-memory session store.
 *
 * Chapter 4 moves this behind the API and Postgres; the shape of what screens
 * consume is deliberately the shape the server will return, so swapping the
 * backing store does not ripple into the UI.
 */

export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

export interface Session {
  id: string;
  title: string;
  model: ModelId;
  createdAt: number;
  messages: Message[];
}

interface SessionsContextValue {
  sessions: Session[];
  getSession: (id: string) => Session | undefined;
  createSession: (model: ModelId) => Session;
  appendMessage: (sessionId: string, role: MessageRole, content: string) => void;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

/** Short, readable, and unique enough for a single process. */
function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** First line of the first message, trimmed to something that fits a list. */
function titleFrom(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= 48) return firstLine;
  return `${firstLine.slice(0, 47)}...`;
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);

  const createSession = useCallback((model: ModelId): Session => {
    const session: Session = {
      id: makeId(),
      title: "New session",
      model,
      createdAt: Date.now(),
      messages: [],
    };

    setSessions((current) => [session, ...current]);
    return session;
  }, []);

  const appendMessage = useCallback(
    (sessionId: string, role: MessageRole, content: string) => {
      setSessions((current) =>
        current.map((session) => {
          if (session.id !== sessionId) return session;

          const message: Message = {
            id: makeId(),
            role,
            content,
            createdAt: Date.now(),
          };

          return {
            ...session,
            // The first thing the user says names the session.
            title:
              session.messages.length === 0 && role === "user"
                ? titleFrom(content)
                : session.title,
            messages: [...session.messages, message],
          };
        }),
      );
    },
    [],
  );

  const value = useMemo<SessionsContextValue>(
    () => ({
      sessions,
      getSession: (id) => sessions.find((session) => session.id === id),
      createSession,
      appendMessage,
    }),
    [sessions, createSession, appendMessage],
  );

  return <SessionsContext value={value}>{children}</SessionsContext>;
}

export function useSessions(): SessionsContextValue {
  const context = useContext(SessionsContext);

  if (!context) {
    throw new Error("useSessions must be used inside a <SessionsProvider>.");
  }

  return context;
}
