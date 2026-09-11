import type { ReactNode } from "react";

import { useTheme } from "../providers/theme/index.tsx";

/**
 * A titled, bordered container. Every framed region in the UI goes through
 * this so borders and titles stay consistent as themes change.
 */
export function Panel({
  title,
  children,
  focused = false,
  flexGrow,
  padding = 1,
}: {
  title?: string;
  children?: ReactNode;
  focused?: boolean;
  flexGrow?: number;
  padding?: number;
}) {
  const { theme } = useTheme();

  return (
    <box
      title={title}
      titleColor={focused ? theme.accent : theme.muted}
      border
      borderStyle="rounded"
      borderColor={focused ? theme.borderFocus : theme.border}
      backgroundColor={theme.panel}
      flexDirection="column"
      flexGrow={flexGrow}
      // Clip rather than let children paint over each other. Without this a
      // short terminal collapses stacked rows onto one line, and because
      // spaces are transparent the result is two strings interleaved.
      overflow="hidden"
      padding={padding}
    >
      {children}
    </box>
  );
}
