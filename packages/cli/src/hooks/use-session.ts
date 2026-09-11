import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, Session } from "@driftcode/shared";

import { describeError, useSessions } from "../providers/sessions/index.tsx";

/**
 * One session, its transcript, and the turn currently streaming.
 *
 * The in-flight reply is kept out of `session.messages` so the transcript only
 * ever holds what the server has actually stored. The screen renders the
 * streaming text as a trailing bubble until the `done` event arrives with the
 * persisted message.
 */
export function useSession(sessionId: string | undefined) {
  const { client, refresh } = useSessions();

  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

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

  // Leaving the screen mid-reply should not leave the request running.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const appendLocal = useCallback((message: Message) => {
    setSession((current) =>
      current
        ? { ...current, messages: [...current.messages, message] }
        : current,
    );
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (!sessionId || sending) return;

      const controller = new AbortController();
      abortRef.current = controller;

      setSending(true);
      setError(null);
      setStreaming("");

      // Shown immediately; the `start` event replaces it with the stored row.
      const pendingId = `pending-${Date.now()}`;
      appendLocal({
        id: pendingId,
        sessionId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      });

      let text = "";

      try {
        for await (const event of client.chat(
          sessionId,
          content,
          controller.signal,
        )) {
          if (event.type === "start") {
            setSession((current) =>
              current
                ? {
                    ...current,
                    messages: current.messages.map((message) =>
                      message.id === pendingId ? event.userMessage : message,
                    ),
                  }
                : current,
            );
          } else if (event.type === "delta") {
            text += event.text;
            setStreaming(text);
          } else if (event.type === "done") {
            appendLocal(event.message);
            setStreaming(null);
          } else {
            // The server persists whatever streamed before the failure, so
            // keep it in the transcript rather than dropping it. A later
            // reload replaces this local copy with the stored row.
            if (text.length > 0) {
              appendLocal({
                id: `partial-${Date.now()}`,
                sessionId,
                role: "assistant",
                content: text,
                createdAt: new Date().toISOString(),
              });
            }

            setError(event.message);
            setStreaming(null);
          }
        }
      } catch (cause) {
        setError(describeError(cause));
        setStreaming(null);
        // The server may still have stored the user message - resync rather
        // than leaving an optimistic row that might not exist.
        await load();
      } finally {
        setSending(false);
        abortRef.current = null;
        // The first message renames the session, so the list is now stale.
        await refresh();
      }
    },
    [appendLocal, client, load, refresh, sessionId, sending],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { session, state, error, sending, streaming, send, stop, reload: load };
}
