import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { resolveModel, summarizeToolCall, type AgentMode } from "@driftcode/shared";

import { CommandMenu } from "../components/command-menu/index.tsx";
import { useCommandMenu } from "../components/command-menu/use-command-menu.ts";
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
import { useDialog } from "../providers/dialog/index.tsx";
import { useGatedKeyboard } from "../providers/keyboard-layer/index.tsx";
import { describeError, useSessions } from "../providers/sessions/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";
import { useToast } from "../providers/toast/index.tsx";

export function SessionScreen() {
  const { theme } = useTheme();
  const { connection, cwd } = useAppConfig();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { rememberSession } = useConfig();
  const { client, refresh } = useSessions();
  const { isOpen: dialogOpen } = useDialog();
  const { toast } = useToast();

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

  const menu = useCommandMenu(send);
  const [switchingMode, setSwitchingMode] = useState(false);

  // Opening a session makes it the one `drift --resume` reopens.
  useEffect(() => {
    if (sessionId) rememberSession(sessionId);
  }, [rememberSession, sessionId]);

  const toggleMode = async (current: AgentMode) => {
    if (!sessionId || sending || switchingMode) return;

    const next: AgentMode = current === "plan" ? "build" : "plan";

    setSwitchingMode(true);

    try {
      await client.update(sessionId, { mode: next });
      // Both matter: reload feeds this screen, refresh feeds the session list
      // (and with it the status bar). Skipping the reload leaves the screen on
      // the old mode, and the next toggle then flips from a stale value.
      await reload();
      await refresh();
      toast(`Switched to ${next} mode.`, "success");
    } catch (cause) {
      toast(describeError(cause), "danger");
    } finally {
      setSwitchingMode(false);
    }
  };

  // Silent while the command menu or a dialog is up, so one keypress is not
  // acted on twice.
  useGatedKeyboard((key) => {
    // An approval prompt owns the keyboard while it is up: anything else would
    // let a keystroke meant for it navigate away instead.
    if (awaitingApproval) {
      if (key.name === "y") answerApproval(true);
      else if (key.name === "n" || key.name === "escape") answerApproval(false);
      return;
    }

    // Tab and shift+tab both toggle: tab is what people try first, shift+tab
    // is the habit from other agents. Neither is used for anything else here.
    if (key.name === "tab" && session) {
      void toggleMode(session.mode);
      return;
    }

    // Not ctrl+m (that is ASCII carriage return, indistinguishable from Enter)
    // and not ctrl+p, which VS Code swallows for its own Quick Open before the
    // integrated terminal ever sees it. alt is free on both counts.
    if (key.meta && key.name === "m" && !sending) {
      navigate(`/session/${sessionId}/model`);
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
  }, !menu.open && !dialogOpen);

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
                ? "Plan mode - read-only. tab to switch to build."
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

      {error !== null && <Notice message={error} />}

      {sending && !awaitingApproval && (
        <box paddingX={1}>
          <Spinner label={`${model.label} is working - esc to stop`} />
        </box>
      )}

      {menu.open && (
        <CommandMenu
          draft={menu.draft}
          onRun={menu.clear}
          onClose={menu.clear}
        />
      )}

      <InputBar
        handleRef={menu.handleRef}
        onSubmit={menu.submit}
        onChange={menu.setDraft}
        disabled={connection === "offline" || sending || dialogOpen}
        placeholder={
          connection === "offline"
            ? "Server offline - start it with: bun run dev:server"
            : sending
              ? "Working..."
              : session.mode === "plan"
                ? `Ask ${model.label} to look into something, or / for commands...`
                : `Tell ${model.label} what to build, or / for commands...`
        }
      />
    </box>
  );
}
