import { useTheme } from "../providers/theme/index.tsx";
import { useToast, type ToastTone } from "../providers/toast/index.tsx";

/**
 * Transient messages, stacked just above the status bar.
 *
 * Takes no height when empty so the layout does not shift as toasts come and
 * go - a prompt that jumps a row every time something is confirmed is worse
 * than no confirmation at all.
 */
export function ToastRail() {
  const { theme } = useTheme();
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  const colors: Record<ToastTone, string> = {
    info: theme.accent,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
  };

  return (
    <box flexDirection="column" flexShrink={0} paddingX={1}>
      {toasts.map((entry) => (
        <text key={entry.id} flexShrink={0}>
          <span fg={colors[entry.tone]}>{"* "}</span>
          <span fg={theme.muted}>{entry.message}</span>
        </text>
      ))}
    </box>
  );
}
