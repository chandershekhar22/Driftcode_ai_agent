import { useEffect, useState } from "react";

import { useGatedKeyboard } from "../../providers/keyboard-layer/index.tsx";
import { useTheme } from "../../providers/theme/index.tsx";
import { useCommands } from "./commands.tsx";
import { filterCommands } from "./filter-commands.ts";

/**
 * The slash-command menu.
 *
 * It hovers above the prompt while the prompt keeps focus: the user is still
 * typing into the input, and the text they type is the filter. Only the keys
 * that mean something to a menu - up, down, enter, esc - are taken, and those
 * are taken on the menu layer so the screen behind ignores them.
 */
export function CommandMenu({
  draft,
  onRun,
  onClose,
}: {
  /** The current prompt text, including the leading slash. */
  draft: string;
  /** Called after a command runs, so the prompt can be cleared. */
  onRun: () => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const commands = useCommands();
  const [cursor, setCursor] = useState(0);

  const filtered = filterCommands(commands, draft);
  const index = Math.min(cursor, Math.max(filtered.length - 1, 0));
  const selected = filtered[index];

  // Typing narrows the list; keeping a stale cursor would leave the highlight
  // on a row that is no longer there.
  useEffect(() => {
    setCursor(0);
  }, [draft]);

  useGatedKeyboard((key) => {
    if (key.name === "escape") {
      onClose();
      return;
    }

    if (key.name === "up") {
      setCursor(Math.max(index - 1, 0));
      return;
    }

    if (key.name === "down") {
      setCursor(Math.min(index + 1, Math.max(filtered.length - 1, 0)));
      return;
    }

    if (key.name === "return" && selected) {
      // Cleared before running: a command that opens a dialog would otherwise
      // leave "/models" sitting in the prompt behind it.
      onRun();
      selected.run();
    }
  });

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={theme.borderFocus}
      backgroundColor={theme.panel}
      paddingX={1}
    >
      {filtered.length === 0 ? (
        <text fg={theme.muted} flexShrink={0}>
          No command matches. esc to go back to typing.
        </text>
      ) : (
        filtered.map((command) => {
          const active = command.name === selected?.name;

          return (
            <text key={command.name} flexShrink={0}>
              <span fg={active ? theme.accent : theme.border}>
                {active ? "> " : "  "}
              </span>
              <span fg={active ? theme.accent : theme.text}>
                {`/${command.name}`.padEnd(12)}
              </span>
              <span fg={theme.muted}>{command.description}</span>
            </text>
          );
        })
      )}
    </box>
  );
}
