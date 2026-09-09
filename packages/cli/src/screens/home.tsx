import { useNavigate } from "react-router";

import { Panel } from "../components/panel.tsx";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useSessions } from "../providers/sessions/index.tsx";
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
  const { sessions, state, error } = useSessions();
  const navigate = useNavigate();

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

  const handleSelect = (_index: number, option: { value?: unknown } | null) => {
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
                : `${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
          </text>
        )}
      </box>

      <Panel title=" Sessions " flexGrow={1} focused>
        <select
          flexGrow={1}
          focused
          options={options}
          showDescription
          backgroundColor={theme.panel}
          textColor={theme.text}
          descriptionColor={theme.muted}
          focusedTextColor={theme.accent}
          selectedTextColor={theme.accent}
          onSelect={handleSelect}
        />
      </Panel>
    </box>
  );
}
