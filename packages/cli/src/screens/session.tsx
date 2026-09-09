import { useKeyboard } from "@opentui/react";
import { useNavigate, useParams } from "react-router";
import { resolveModel } from "@driftcode/shared";

import { InputBar } from "../components/input-bar.tsx";
import { MessageView } from "../components/messages/index.tsx";
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

  const { session, state, error, sending, send } = useSession(sessionId);

  useKeyboard((key) => {
    if (key.name === "escape") navigate("/");
  });

  if (state === "loading") {
    return (
      <Panel title=" Session " flexGrow={1}>
        <Spinner label="Loading transcript..." />
      </Panel>
    );
  }

  if (state === "error" || !session) {
    return (
      <Panel title=" Session " flexGrow={1}>
        <text fg={theme.danger}>{error ?? "That session could not be loaded."}</text>
        <text fg={theme.muted}>Press esc to go back.</text>
      </Panel>
    );
  }

  const model = resolveModel(session.model);

  return (
    <box flexDirection="column" flexGrow={1}>
      <Panel title={` ${session.title} `} flexGrow={1} focused>
        {session.messages.length === 0 ? (
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
            {/* Chapter 5 replaces this with the model's streamed reply. */}
            <text fg={theme.muted}>
              Saved. Replies arrive once the model is wired up in chapter 5.
            </text>
          </scrollbox>
        )}
      </Panel>

      <InputBar
        onSubmit={send}
        disabled={connection === "offline" || sending}
        placeholder={
          connection === "offline"
            ? "Server offline - start it with: bun run dev:server"
            : `Message ${model.label}...`
        }
      />
    </box>
  );
}
