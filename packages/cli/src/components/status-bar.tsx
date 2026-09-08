import { useTheme } from "../providers/theme/index.tsx";

export type ConnectionState = "connected" | "offline";

/**
 * The bottom strip. Left side is state the user needs at a glance (model,
 * connection); right side is the keybinding cheatsheet, which is the only
 * discoverability a terminal app gets.
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
    >
      <text>
        <span fg={connected ? theme.success : theme.danger}>
          {connected ? "*" : "x"}
        </span>
        <span fg={theme.muted}> {connected ? "connected" : "offline"}</span>
        <span fg={theme.border}>  |  </span>
        <span fg={theme.muted}>{model}</span>
      </text>
      <text fg={theme.muted}>
        {hints.map((hint) => `${hint.key} ${hint.label}`).join("   ")}
      </text>
    </box>
  );
}
