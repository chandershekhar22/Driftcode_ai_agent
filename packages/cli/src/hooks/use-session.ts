import { useCallback, useEffect, useState } from "react";
import type { Session } from "@driftcode/shared";

import { describeError, useSessions } from "../providers/sessions/index.tsx";

/**
 * One session and its transcript.
 *
 * Sending appends optimistically so the terminal feels immediate, then
 * reconciles with what the server actually stored - the server owns ids,
 * timestamps and the session title.
 */
export function useSession(sessionId: string | undefined) {
  const { client, refresh } = useSessions();

  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) {
      setState("error");
      setError("No session id.");
      return;
    }

    try {
      setSession(await client.get(sessionId));
      setState("ready");
      setError(null);
    } catch (cause) {
      setState("error");
      setError(describeError(cause));
    }
  }, [client, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(
    async (content: string) => {
      if (!sessionId || sending) return;

      setSending(true);

      // Show it immediately; the reload below replaces it with the stored row.
      setSession((current) =>
        current
          ? {
              ...current,
              messages: [
                ...current.messages,
                {
                  id: `pending-${Date.now()}`,
                  sessionId,
                  role: "user" as const,
                  content,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : current,
      );

      try {
        await client.appendMessage(sessionId, "user", content);
        await load();
        // The first message renames the session, so the list is now stale.
        await refresh();
      } catch (cause) {
        setError(describeError(cause));
        await load();
      } finally {
        setSending(false);
      }
    },
    [client, load, refresh, sessionId, sending],
  );

  return { session, state, error, sending, send, reload: load };
}
