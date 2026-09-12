import { summarizeToolCall } from "@driftcode/shared";

import type { ToolRun } from "../../hooks/use-session.ts";
import { useTheme } from "../../providers/theme/index.tsx";

/**
 * One tool the agent asked for, and how it went.
 *
 * A single line per call: what it did, not the arguments or the output. A
 * terminal transcript filled with file contents is unreadable, and the model
 * has already seen them.
 */
export function ToolRunView({ run }: { run: ToolRun }) {
  const { theme } = useTheme();

  const { marker, color, detail } = describe(run, theme);

  return (
    <box flexDirection="row" flexShrink={0}>
      <text fg={color} flexShrink={0}>
        {`${marker} `}
      </text>
      <text fg={theme.muted} flexGrow={1} wrapMode="word">
        {summarizeToolCall(run.call.name, run.call.input)}
        {detail}
      </text>
    </box>
  );
}

function describe(
  run: ToolRun,
  theme: ReturnType<typeof useTheme>["theme"],
): { marker: string; color: string; detail: string } {
  if (run.awaitingApproval) {
    return { marker: "?", color: theme.warning, detail: " - waiting for you" };
  }

  if (run.denied) {
    return { marker: "x", color: theme.muted, detail: " - declined" };
  }

  if (!run.result) {
    return { marker: "-", color: theme.warning, detail: "" };
  }

  if (!run.result.ok) {
    return {
      marker: "x",
      color: theme.danger,
      // The summary already names the tool, so only the outcome is added.
      detail: ` - failed`,
    };
  }

  return { marker: "+", color: theme.success, detail: "" };
}
