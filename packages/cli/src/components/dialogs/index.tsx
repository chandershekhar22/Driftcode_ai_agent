import { useDialog } from "../../providers/dialog/index.tsx";
import type { DialogKind } from "../../providers/dialog/types.ts";
import { useGatedKeyboard } from "../../providers/keyboard-layer/index.tsx";
import { useTheme } from "../../providers/theme/index.tsx";
import { AgentsDialog } from "./agents-dialog.tsx";
import { CommandsDialog } from "./commands-dialog.tsx";
import { ModelsDialog } from "./models-dialog.tsx";
import { SessionsDialog } from "./sessions-dialog.tsx";
import { ThemeDialog } from "./theme-dialog.tsx";

const TITLES: Record<DialogKind, string> = {
  commands: " Commands ",
  sessions: " Sessions ",
  models: " Models ",
  agents: " Mode ",
  theme: " Theme ",
  help: " Keys ",
};

/**
 * The open dialog, drawn over the screen rather than instead of it.
 *
 * The screen behind is collapsed to zero height rather than unmounted, so a
 * running agent loop is not abandoned when someone opens a dialog mid-turn.
 * Absolute positioning would have been tidier, but OpenTUI does not resolve a
 * height for an absolutely-positioned box here - its contents render as
 * nothing at all.
 */
export function DialogHost() {
  const { theme } = useTheme();
  const { dialog, close } = useDialog();

  if (!dialog) return null;

  return (
    <box flexDirection="column" flexGrow={1} backgroundColor={theme.bg}>
      <box
        flexDirection="column"
        flexGrow={1}
        border
        borderStyle="rounded"
        borderColor={theme.borderFocus}
        backgroundColor={theme.panel}
        title={TITLES[dialog.kind]}
        titleColor={theme.accent}
        padding={1}
      >
        {dialog.kind === "commands" && <CommandsDialog onClose={close} />}
        {dialog.kind === "sessions" && <SessionsDialog onClose={close} />}
        {dialog.kind === "models" && <ModelsDialog onClose={close} />}
        {dialog.kind === "agents" && <AgentsDialog onClose={close} />}
        {dialog.kind === "theme" && <ThemeDialog onClose={close} />}
        {dialog.kind === "help" && <HelpDialog onClose={close} />}
      </box>
    </box>
  );
}

const KEYS: readonly [string, string][] = [
  ["/", "Open the command menu"],
  ["enter", "Send, or select"],
  ["esc", "Back, close, or interrupt a reply"],
  ["tab", "Switch between plan and build mode"],
  ["alt+m", "Switch model"],
  ["ctrl+t", "Cycle the theme"],
  ["ctrl+c", "Quit"],
];

function HelpDialog({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();

  useGatedKeyboard((key) => {
    if (key.name === "escape" || key.name === "return") onClose();
  });

  return (
    <box flexDirection="column" flexGrow={1}>
      {KEYS.map(([key, description]) => (
        <text key={key} flexShrink={0}>
          <span fg={theme.accent}>{key.padEnd(10)}</span>
          <span fg={theme.text}>{description}</span>
        </text>
      ))}

      <text fg={theme.muted} flexShrink={0}>
        {" "}
      </text>
      <text fg={theme.muted} flexShrink={0}>
        esc to close
      </text>
    </box>
  );
}
