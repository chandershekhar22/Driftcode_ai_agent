import { TextAttributes } from "@opentui/core";

import { useTheme } from "../providers/theme/index.tsx";

/**
 * The top strip: wordmark on the left, the project the agent is pointed at on
 * the right. Kept to a single row - vertical space is the scarcest resource in
 * a terminal.
 */
export function Header({ cwd, version }: { cwd: string; version: string }) {
  const { theme } = useTheme();

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
      backgroundColor={theme.bg}
    >
      <text>
        <span fg={theme.accent} attributes={TextAttributes.BOLD}>
          drift
        </span>
        <span fg={theme.muted}> v{version}</span>
      </text>
      <text fg={theme.muted}>{cwd}</text>
    </box>
  );
}
