import type { AgentMode } from "@driftcode/shared";

import { useTheme } from "../providers/theme/index.tsx";

export type ConnectionState = "connected" | "offline";

/**
 * The bottom strip. Left side is state the user needs at a glance (model,
 * connection); right side is the keybinding cheatsheet, which is the only
 * discoverability a terminal app gets.
 *
 * The two halves must not fight over a narrow terminal: the state never
 * shrinks, and the hints truncate instead - a clipped cheatsheet is a nuisance,
 * a clipped model name is misinformation.
 */
export function StatusBar({
  model,
  mode,
  connection,
  hints,
}: {
  model: string;
  /** Absent outside a session - the mode belongs to a session, not the app. */
  mode?: AgentMode;
  connection: ConnectionState;
  hints: readonly { key: string; label: string }[];
}) {
  const { theme } = useTheme();
  const connected = connection === "connected";

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
      backgroundColor={theme.bg}
      overflow="hidden"
    >
      <text flexShrink={0}>
        {mode ? (
          <span fg={mode === "build" ? theme.warning : theme.accent}>
            {mode === "build" ? "BUILD" : "PLAN"}
          </span>
        ) : null}
        {mode ? <span fg={theme.border}>{"  |  "}</span> : null}
        <span fg={connected ? theme.success : theme.danger}>
          {connected ? "*" : "x"}
        </span>
        <span fg={theme.muted}> {connected ? "connected" : "offline"}</span>
        <span fg={theme.border}>  |  </span>
        <span fg={theme.accent}>{model}</span>
      </text>
      <text fg={theme.muted} truncate wrapMode="none" flexShrink={1}>
        {hints.map((hint) => `${hint.key} ${hint.label}`).join("   ")}
      </text>
    </box>
  );
}
