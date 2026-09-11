import { useTheme } from "../../providers/theme/index.tsx";

export function AssistantMessage({
  content,
  streaming = false,
}: {
  content: string;
  /** Draws a caret so a paused stream is distinguishable from a finished one. */
  streaming?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" paddingBottom={1}>
      <text fg={theme.muted}>drift</text>
      <text fg={theme.text} wrapMode="word">
        {streaming ? `${content}█` : content}
      </text>
    </box>
  );
}
