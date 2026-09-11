import { useTheme } from "../providers/theme/index.tsx";

export type NoticeTone = "danger" | "warning" | "info";

/**
 * A message the user must not miss - a failed turn, a missing key.
 *
 * Deliberately rendered outside the transcript: an error that only appears
 * among the messages is invisible whenever the transcript is empty, which is
 * exactly the case for a failure on the very first turn.
 */
export function Notice({
  message,
  tone = "danger",
  hint,
}: {
  message: string;
  tone?: NoticeTone;
  /** Optional second line - usually what to do about it. */
  hint?: string;
}) {
  const { theme } = useTheme();

  const color =
    tone === "danger"
      ? theme.danger
      : tone === "warning"
        ? theme.warning
        : theme.accent;

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={color}
      backgroundColor={theme.panel}
      paddingX={1}
    >
      <text fg={color} wrapMode="word">
        {message}
      </text>
      {hint ? (
        <text fg={theme.muted} wrapMode="word">
          {hint}
        </text>
      ) : null}
    </box>
  );
}
