import { useTheme } from "../../providers/theme/index.tsx";

export function AssistantMessage({ content }: { content: string }) {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" paddingBottom={1}>
      <text fg={theme.muted}>drift</text>
      <text fg={theme.text} wrapMode="word">
        {content}
      </text>
    </box>
  );
}
