import { useKeyboard } from "@opentui/react";
import { useNavigate, useParams } from "react-router";
import { resolveModel } from "@driftcode/shared";

import { InputBar } from "../components/input-bar.tsx";
import { MessageView } from "../components/messages/index.tsx";
import { Panel } from "../components/panel.tsx";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useSessions } from "../providers/sessions/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

export function SessionScreen() {
  const { theme } = useTheme();
  const { connection } = useAppConfig();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { getSession, appendMessage } = useSessions();
  const navigate = useNavigate();

  useKeyboard((key) => {
    if (key.name === "escape") navigate("/");
  });

  const session = sessionId ? getSession(sessionId) : undefined;

  // Reachable if a session id is stale - navigating away during render is not
  // allowed, so render an explanation and let the user press esc.
  if (!session) {
    return (
      <Panel title=" Session " flexGrow={1}>
        <text fg={theme.danger}>That session no longer exists.</text>
        <text fg={theme.muted}>Press esc to go back.</text>
      </Panel>
    );
  }

  const model = resolveModel(session.model);

  const send = (content: string) => {
    appendMessage(session.id, "user", content);

    // Placeholder until chapter 5 streams a real reply from the server.
    appendMessage(
      session.id,
      "assistant",
      `I can hear you, but I am not wired to ${model.label} yet - that lands in chapter 5.`,
    );
  };

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
          </scrollbox>
        )}
      </Panel>

      <InputBar
        onSubmit={send}
        disabled={connection === "offline"}
        placeholder={
          connection === "offline"
            ? "Server offline - start it with: bun run dev:server"
            : `Message ${model.label}...`
        }
      />
    </box>
  );
}
