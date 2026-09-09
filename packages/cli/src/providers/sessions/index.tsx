import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CreateSessionInput, Session, SessionSummary } from "@driftcode/shared";

import { ApiClientError } from "../../lib/api-client.ts";
import { httpSessions, type SessionsClient } from "../../lib/sessions-api.ts";

/**
 * The session list, backed by the server.
 *
 * Only the list lives here - a single session's transcript is fetched by the
 * screen that shows it (see `useSession`), so opening one session does not
 * hold every other transcript in memory.
 */

export type LoadState = "loading" | "ready" | "error";

interface SessionsContextValue {
  sessions: SessionSummary[];
  state: LoadState;
  error: string | null;
  refresh: () => Promise<void>;
  createSession: (input: CreateSessionInput) => Promise<Session | null>;
  removeSession: (id: string) => Promise<void>;
  /** Exposed so screens can talk to the same backend the list uses. */
  client: SessionsClient;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function SessionsProvider({
  children,
  client = httpSessions,
  /** Skipped when the server was unreachable at startup. */
  enabled = true,
}: {
  children: ReactNode;
  client?: SessionsClient;
  enabled?: boolean;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [state, setState] = useState<LoadState>(enabled ? "loading" : "error");
  const [error, setError] = useState<string | null>(
    enabled ? null : "Not connected to the driftcode server.",
  );

  const refresh = useCallback(async () => {
    if (!enabled) return;

    try {
      setSessions(await client.list());
      setState("ready");
      setError(null);
    } catch (cause) {
      setState("error");
      setError(describeError(cause));
    }
  }, [client, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSession = useCallback(
    async (input: CreateSessionInput) => {
      try {
        const session = await client.create(input);
        await refresh();
        return session;
      } catch (cause) {
        setState("error");
        setError(describeError(cause));
        return null;
      }
    },
    [client, refresh],
  );

  const removeSession = useCallback(
    async (id: string) => {
      try {
        await client.remove(id);
        await refresh();
      } catch (cause) {
        setState("error");
        setError(describeError(cause));
      }
    },
    [client, refresh],
  );

  const value = useMemo<SessionsContextValue>(
    () => ({
      sessions,
      state,
      error,
      refresh,
      createSession,
      removeSession,
      client,
    }),
    [sessions, state, error, refresh, createSession, removeSession, client],
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
