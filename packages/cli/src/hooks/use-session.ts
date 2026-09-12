import { useCallback, useEffect, useRef, useState } from "react";
import {
  findTool,
  type ChatEvent,
  type Message,
  type Session,
  type ToolCall,
  type ToolResult,
} from "@driftcode/shared";

import { executeToolCall } from "../lib/local-tools.ts";
import { describeError, useSessions } from "../providers/sessions/index.tsx";

/**
 * One session, its transcript, and the agent loop.
 *
 * A turn is not one request. The model answers, may ask for tools, and the
 * results go back for it to continue - so a single message from the user can
 * mean several round trips. That loop lives here because only the client can
 * run the tools: the files are on this machine, not the server's.
 */

/** Stops a confused model spending the user's money in a circle. */
const MAX_TOOL_ROUNDS = 8;

export interface ToolRun {
  call: ToolCall;
  result?: ToolResult;
  /** True while awaiting the user's decision. */
  awaitingApproval?: boolean;
  denied?: boolean;
}

/**
 * Tools that change things ask first. Read-only tools do not: an agent that
 * needs permission to look at a file is not worth using.
 */
function needsApproval(call: ToolCall): boolean {
  return findTool(call.name)?.mode === "build";
}

export function useSession(sessionId: string | undefined, projectRoot: string) {
  const { client, refresh } = useSessions();

  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [sending, setSending] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  /** Resolves when the user answers the pending approval prompt. */
  const approvalRef = useRef<((approved: boolean) => void) | null>(null);
  /** An error from this turn, so the closing reload cannot erase it. */
  const turnErrorRef = useRef<string | null>(null);

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

  // Leaving the screen mid-reply should not leave the request running, and a
  // pending approval prompt must not leave the loop waiting forever.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      approvalRef.current?.(false);
    };
  }, []);

  const appendLocal = useCallback((message: Message) => {
    setSession((current) =>
      current
        ? { ...current, messages: [...current.messages, message] }
        : current,
    );
  }, []);

  /** Shows the approval prompt and waits for the answer. */
  const askApproval = useCallback((call: ToolCall) => {
    return new Promise<boolean>((resolve) => {
      approvalRef.current = resolve;

      setRuns((current) =>
        current.map((run) =>
          run.call.id === call.id ? { ...run, awaitingApproval: true } : run,
        ),
      );
    });
  }, []);

  const answerApproval = useCallback((approved: boolean) => {
    const resolve = approvalRef.current;
    if (!resolve) return;

    approvalRef.current = null;
    resolve(approved);
  }, []);

  /**
   * Consumes one stream, returning the tool calls it asked for.
   *
   * Text accumulates across the whole turn rather than per request, so a model
   * that talks, uses a tool, then talks again reads as one reply.
   */
  const consume = useCallback(
    async (
      stream: AsyncIterable<ChatEvent>,
      text: { value: string },
    ): Promise<ToolCall[]> => {
      const calls: ToolCall[] = [];

      for await (const event of stream) {
        if (event.type === "start") {
          setSession((current) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id.startsWith("pending-")
                      ? event.userMessage
                      : message,
                  ),
                }
              : current,
          );
        } else if (event.type === "delta") {
          text.value += event.text;
          setStreaming(text.value);
        } else if (event.type === "tool-call") {
          calls.push(event.call);
          setRuns((current) => [...current, { call: event.call }]);
        } else if (event.type === "tool-result") {
          setRuns((current) =>
            current.map((run) =>
              run.call.id === event.result.id
                ? { ...run, result: event.result }
                : run,
            ),
          );
        } else if (event.type === "done") {
          // The server stored this leg; the transcript reload at the end of
          // the turn picks it up, so nothing to do here.
        } else {
          // The server persists whatever streamed before the failure, so keep
          // it in the transcript rather than dropping it. A later reload
          // replaces this local copy with the stored row.
          if (text.value.trim().length > 0) {
            appendLocal({
              id: `partial-${Date.now()}`,
              sessionId: sessionId ?? "",
              role: "assistant",
              content: text.value,
              createdAt: new Date().toISOString(),
            });
            text.value = "";
            setStreaming(null);
          }

          turnErrorRef.current = event.message;
          setError(event.message);
        }
      }

      return calls;
    },
    [appendLocal, sessionId],
  );

  /** Runs the calls the agent asked for, asking first where it matters. */
  const runTools = useCallback(
    async (calls: ToolCall[]): Promise<ToolResult[]> => {
      const results: ToolResult[] = [];

      for (const call of calls) {
        if (needsApproval(call)) {
          const approved = await askApproval(call);

          setRuns((current) =>
            current.map((run) =>
              run.call.id === call.id
                ? { ...run, awaitingApproval: false, denied: !approved }
                : run,
            ),
          );

          if (!approved) {
            // Told plainly, so the agent proposes something else rather than
            // retrying the same call.
            results.push({
              id: call.id,
              name: call.name,
              ok: false,
              output:
                "The user declined this tool call. Do not retry it; ask what they would prefer.",
              summary: `declined ${call.name}`,
            });
            continue;
          }
        }

        const result = await executeToolCall(projectRoot, call);
        results.push(result);

        setRuns((current) =>
          current.map((run) =>
            run.call.id === call.id ? { ...run, result } : run,
          ),
        );
      }

      return results;
    },
    [askApproval, projectRoot],
  );

  const send = useCallback(
    async (content: string) => {
      if (!sessionId || sending) return;

      const controller = new AbortController();
      abortRef.current = controller;

      setSending(true);
      setError(null);
      setStreaming("");
      setRuns([]);
      turnErrorRef.current = null;

      // Shown immediately; the `start` event replaces it with the stored row.
      appendLocal({
        id: `pending-${Date.now()}`,
        sessionId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      });

      const text = { value: "" };

      try {
        let calls = await consume(
          client.chat(sessionId, content, controller.signal),
          text,
        );

        for (let round = 0; calls.length > 0; round++) {
          if (round >= MAX_TOOL_ROUNDS) {
            setError(
              `Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls. Ask again if it was on the right track.`,
            );
            break;
          }

          if (controller.signal.aborted) break;

          const results = await runTools(calls);

          if (controller.signal.aborted) break;

          calls = await consume(
            client.continueWithToolResults(
              sessionId,
              results,
              controller.signal,
            ),
            text,
          );
        }
      } catch (cause) {
        const message = describeError(cause);
        setStreaming(null);

        // Resync before recording the error: a successful load clears the
        // error field, which would silently swallow the message.
        await load();
        setError(message);
        setSending(false);
        abortRef.current = null;
        await refresh();
        return;
      }

      setStreaming(null);
      setSending(false);
      abortRef.current = null;

      // The stored transcript is now the truth - it has the assistant text and
      // the tool messages, with real ids and timestamps.
      await load();

      // load() clears the error field on success, which would silently swallow
      // a failure that happened mid-turn.
      if (turnErrorRef.current) setError(turnErrorRef.current);
      // The first message renames the session, so the list is stale too.
      await refresh();
    },
    [
      appendLocal,
      client,
      consume,
      load,
      refresh,
      runTools,
      sending,
      sessionId,
    ],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // A pending prompt would otherwise keep the loop parked on an await.
    approvalRef.current?.(false);
    approvalRef.current = null;
  }, []);

  const awaitingApproval = runs.find((run) => run.awaitingApproval) ?? null;

  return {
    session,
    state,
    error,
    sending,
    streaming,
    runs,
    awaitingApproval,
    answerApproval,
    send,
    stop,
    reload: load,
  };
}
