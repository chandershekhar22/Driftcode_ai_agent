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
  connection,
  hints,
}: {
  model: string;
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
        <span fg={connected ? theme.success : theme.danger}>
          {connected ? "*" : "x"}
        </span>
        <span fg={theme.muted}> {connected ? "connected" : "offline"}</span>
        <span fg={theme.border}>  |  </span>
        <span fg={theme.accent}>{model}</span>
      </text>
      <text fg={theme.muted} truncate flexShrink={1}>
        {hints.map((hint) => `${hint.key} ${hint.label}`).join("   ")}
      </text>
    </box>
  );
}
