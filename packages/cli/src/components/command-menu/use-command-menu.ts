import { useCallback, useRef, useState } from "react";

import type { InputBarHandle } from "../input-bar.tsx";
import { isCommandDraft } from "./filter-commands.ts";

/**
 * Wires a prompt to the command menu.
 *
 * The menu opens on what is typed rather than on a keybinding, so the prompt
 * keeps focus throughout and "/" behaves the way it does in every chat app
 * that has one.
 */
export function useCommandMenu(onSend: (value: string) => void) {
  const [draft, setDraft] = useState("");
  const handleRef = useRef<InputBarHandle>(null);

  const open = isCommandDraft(draft);

  const clear = useCallback(() => {
    handleRef.current?.clear();
    setDraft("");
  }, []);

  /**
   * Enter reaches both the menu and the input. The menu runs the command; this
   * makes sure the same keypress does not also send "/models" to the agent.
   */
  const submit = useCallback(
    (value: string) => {
      if (isCommandDraft(value)) return;
      onSend(value);
    },
    [onSend],
  );

  return { draft, setDraft, open, submit, clear, handleRef };
}
