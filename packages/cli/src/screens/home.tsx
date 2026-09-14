import { useState } from "react";
import { useNavigate } from "react-router";
import type { SessionSummary } from "@driftcode/shared";

import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useDialog } from "../providers/dialog/index.tsx";
import { useGatedKeyboard } from "../providers/keyboard-layer/index.tsx";
import { useSessions } from "../providers/sessions/index.tsx";
import { useToast } from "../providers/toast/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

/** "3m ago" - precise enough for a session list, no dependency needed. */
function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);

  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function HomeScreen() {
  const { theme } = useTheme();
  const { model } = useAppConfig();
  const { sessions, state, error, removeSession } = useSessions();
  const { open: openDialog, isOpen: dialogOpen } = useDialog();
  const { toast } = useToast();
  const navigate = useNavigate();

  // The select owns the cursor and exposes no getter for it, so we mirror it
  // here to know which row a keybinding applies to.
  const [highlighted, setHighlighted] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(
    null,
  );

  const options = [
    {
      name: "New session",
      description: `Start a conversation with ${model.label}`,
      value: "new",
    },
    ...sessions.map((session) => ({
      name: session.title,
      description: `${session.messageCount} message${
        session.messageCount === 1 ? "" : "s"
      } - ${relativeTime(session.updatedAt)}`,
      value: `session:${session.id}`,
    })),
  ];

  /** The first row is "New session", so session rows are offset by one. */
  const highlightedSession = sessions[highlighted - 1];

  useGatedKeyboard((key) => {
    if (pendingDelete) {
      if (key.name === "y") {
        const target = pendingDelete;
        setPendingDelete(null);
        void removeSession(target.id).then(() =>
          toast(`Deleted "${target.title}".`, "success"),
        );
      } else if (key.name === "n" || key.name === "escape") {
        setPendingDelete(null);
      }
      return;
    }

    // No prompt on this screen to type a slash into, so the menu opens as a
    // searchable dialog instead.
    if (key.name === "/" || key.sequence === "/") {
      openDialog("commands");
      return;
    }

    // Destructive, so it asks first - there is no undo for a deleted
    // transcript.
    // Plain d: the list has no text input, and ctrl+d conventionally means
    // EOF/quit, which is a bad thing to overload with a destructive action.
    if (key.name === "d" && !key.ctrl && highlightedSession) {
      setPendingDelete(highlightedSession);
    }
  }, !dialogOpen);

  const handleSelect = (_index: number, option: { value?: unknown } | null) => {
    if (pendingDelete) return;

    const value = typeof option?.value === "string" ? option.value : null;
    if (!value) return;

    if (value === "new") {
      navigate("/new");
      return;
    }

    navigate(`/session/${value.slice("session:".length)}`);
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <box paddingX={1} paddingTop={1}>
        <ascii-font text="drift" font="tiny" color={theme.accent} />
      </box>

      <box paddingX={1} paddingBottom={1}>
        {state === "error" ? (
          <text fg={theme.danger}>{error}</text>
        ) : (
          <text fg={theme.muted}>
            {state === "loading"
              ? "Loading sessions..."
              : sessions.length === 0
                ? "No sessions yet."
                : `${sessions.length} session${sessions.length === 1 ? "" : "s"} - d delete, / commands`}
          </text>
        )}
      </box>

      <Panel title=" Sessions " flexGrow={1} focused>
        <select
          flexGrow={1}
          focused={pendingDelete === null}
          options={options}
          showDescription
          backgroundColor={theme.panel}
          textColor={theme.text}
          descriptionColor={theme.muted}
          focusedTextColor={theme.accent}
          selectedTextColor={theme.accent}
          onChange={(index) => setHighlighted(index)}
          onSelect={handleSelect}
        />
      </Panel>

      {pendingDelete && (
        <Notice
          tone="warning"
          message={`Delete "${pendingDelete.title}" and its ${pendingDelete.messageCount} messages?`}
          hint="y to delete, n to keep"
        />
      )}
    </box>
  );
}
