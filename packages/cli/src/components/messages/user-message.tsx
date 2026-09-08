import { useTheme } from "../../providers/theme/index.tsx";

export function UserMessage({ content }: { content: string }) {
  const { theme } = useTheme();

  return (
    <box flexDirection="row" paddingBottom={1}>
      <text fg={theme.accent}>{"> "}</text>
      <text fg={theme.text} flexGrow={1} wrapMode="word">
        {content}
      </text>
    </box>
  );
}
