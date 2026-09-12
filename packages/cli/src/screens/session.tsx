import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useNavigate, useParams } from "react-router";
import { resolveModel, summarizeToolCall, type AgentMode } from "@driftcode/shared";

import { InputBar } from "../components/input-bar.tsx";
import {
  AssistantMessage,
  MessageView,
  ToolRunView,
} from "../components/messages/index.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import { Spinner } from "../components/spinner.tsx";
import { useSession } from "../hooks/use-session.ts";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useConfig } from "../providers/config/index.tsx";
import { describeError, useSessions } from "../providers/sessions/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

export function SessionScreen() {
  const { theme } = useTheme();
  const { connection, cwd } = useAppConfig();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { rememberSession } = useConfig();
  const { client, refresh } = useSessions();
  const {
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
    reload,
  } = useSession(sessionId, cwd);

  const [switchingMode, setSwitchingMode] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);

  // Opening a session makes it the one `drift --resume` reopens.
  useEffect(() => {
    if (sessionId) rememberSession(sessionId);
  }, [rememberSession, sessionId]);

  const toggleMode = async (current: AgentMode) => {
    if (!sessionId || sending || switchingMode) return;

    const next: AgentMode = current === "plan" ? "build" : "plan";

    setSwitchingMode(true);
    setModeError(null);

    try {
      await client.update(sessionId, { mode: next });
      // Both matter: reload feeds this screen, refresh feeds the session list
      // (and with it the status bar). Skipping the reload leaves the screen on
      // the old mode, and the next toggle then flips from a stale value.
      await reload();
      await refresh();
    } catch (cause) {
      setModeError(describeError(cause));
    } finally {
      setSwitchingMode(false);
    }
  };

  useKeyboard((key) => {
    // An approval prompt owns the keyboard while it is up: anything else would
    // let a keystroke meant for it navigate away instead.
    if (awaitingApproval) {
      if (key.name === "y") answerApproval(true);
      else if (key.name === "n" || key.name === "escape") answerApproval(false);
      return;
    }

    // Not ctrl+m (that is ASCII carriage return, indistinguishable from Enter)
    // and not ctrl+p, which VS Code swallows for its own Quick Open before the
    // integrated terminal ever sees it. alt is free on both counts.
    if (key.meta && key.name === "m" && !sending) {
      navigate(`/session/${sessionId}/model`);
      return;
    }

    if (key.name === "tab" && key.shift && session) {
      void toggleMode(session.mode);
      return;
    }

    if (key.name !== "escape") return;

    // Mid-reply, esc interrupts rather than navigating away - leaving would
    // throw away a reply the user is watching arrive.
    if (sending) {
      stop();
      return;
    }

    navigate("/");
  });

  if (state === "loading") {
    return (
      <Panel title=" Session " flexGrow={1}>
        <Spinner label="Loading transcript..." />
      </Panel>
    );
  }

  if (!session) {
    return (
      <Panel title=" Session " flexGrow={1}>
        <text fg={theme.danger}>
          {error ?? "That session could not be loaded."}
        </text>
        <text fg={theme.muted}>Press esc to go back.</text>
      </Panel>
    );
  }

  const model = resolveModel(session.model);
  const empty =
    session.messages.length === 0 && streaming === null && runs.length === 0;

  return (
    <box flexDirection="column" flexGrow={1}>
      <Panel title={` ${session.title} `} flexGrow={1} focused>
        {empty ? (
          <box flexDirection="column">
            <text fg={theme.muted} flexShrink={0}>
              Nothing here yet. Describe what you want to build.
            </text>
            <text fg={theme.muted} flexShrink={0}>
              Model: {model.label}
            </text>
            <text fg={theme.muted} flexShrink={0}>
              {session.mode === "plan"
                ? "Plan mode - read-only. shift+tab to switch to build."
                : "Build mode - writes and commands ask before running."}
            </text>
          </box>
        ) : (
          <scrollbox flexGrow={1} backgroundColor={theme.panel}>
            {session.messages.map((message) => (
              <MessageView key={message.id} message={message} />
            ))}

            {streaming !== null && streaming.length > 0 && (
              <AssistantMessage content={streaming} streaming />
            )}

            {runs.map((run) => (
              <ToolRunView key={run.call.id} run={run} />
            ))}
          </scrollbox>
        )}
      </Panel>

      {awaitingApproval && (
        <Notice
          tone="warning"
          message={`Allow: ${summarizeToolCall(
            awaitingApproval.call.name,
            awaitingApproval.call.input,
          )}?`}
          hint="y to allow, n to decline"
        />
      )}

      {modeError !== null && <Notice message={modeError} />}
      {error !== null && <Notice message={error} />}

      {sending && !awaitingApproval && (
        <box paddingX={1}>
          <Spinner label={`${model.label} is working - esc to stop`} />
        </box>
      )}

      <InputBar
        onSubmit={send}
        disabled={connection === "offline" || sending}
        placeholder={
          connection === "offline"
            ? "Server offline - start it with: bun run dev:server"
            : sending
              ? "Working..."
              : session.mode === "plan"
                ? `Ask ${model.label} to look into something...`
                : `Tell ${model.label} what to build...`
        }
      />
    </box>
  );
}
