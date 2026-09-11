import { useKeyboard } from "@opentui/react";
import { useNavigate, useParams } from "react-router";
import { resolveModel } from "@driftcode/shared";

import { InputBar } from "../components/input-bar.tsx";
import { AssistantMessage, MessageView } from "../components/messages/index.tsx";
import { Panel } from "../components/panel.tsx";
import { Spinner } from "../components/spinner.tsx";
import { useSession } from "../hooks/use-session.ts";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

export function SessionScreen() {
  const { theme } = useTheme();
  const { connection } = useAppConfig();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { session, state, error, sending, streaming, send, stop } =
    useSession(sessionId);

  useKeyboard((key) => {
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
  const empty = session.messages.length === 0 && streaming === null;

  return (
    <box flexDirection="column" flexGrow={1}>
      <Panel title={` ${session.title} `} flexGrow={1} focused>
        {empty ? (
          <box flexDirection="column">
            <text fg={theme.muted}>
              Nothing here yet. Describe what you want to build.
            </text>
            <text fg={theme.muted}>Model: {model.label}</text>
          </box>
        ) : (
          <scrollbox flexGrow={1} backgroundColor={theme.panel}>
            {session.messages.map((message) => (
              <MessageView key={message.id} message={message} />
            ))}

            {streaming !== null && (
              <AssistantMessage content={streaming} streaming />
            )}

            {error !== null && (
              <text fg={theme.danger} wrapMode="word">
                {error}
              </text>
            )}
          </scrollbox>
        )}
      </Panel>

      {sending && (
        <box paddingX={1}>
          <Spinner label={`${model.label} is replying - esc to stop`} />
        </box>
      )}

      <InputBar
        onSubmit={send}
        disabled={connection === "offline" || sending}
        placeholder={
          connection === "offline"
            ? "Server offline - start it with: bun run dev:server"
            : sending
              ? "Waiting for the reply..."
              : `Message ${model.label}...`
        }
      />
    </box>
  );
}
