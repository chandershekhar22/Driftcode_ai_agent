import { useImperativeHandle, useRef, type Ref } from "react";
import type { InputRenderable } from "@opentui/core";

import { useTheme } from "../providers/theme/index.tsx";

export interface InputBarHandle {
  /** Empties the prompt. Used after a slash command runs. */
  clear: () => void;
}

/**
 * The prompt line.
 *
 * The input is uncontrolled: the renderable owns the draft text and we clear it
 * through a ref. Mirroring it into React state would re-render the whole screen
 * on every keystroke, and a React value that never changes pushes no update to
 * the renderable - so the field would never clear.
 *
 * `onChange` still reports each keystroke, because the command menu needs to
 * know what is being typed. That is a notification, not ownership.
 */
export function InputBar({
  onSubmit,
  onChange,
  placeholder = "Ask anything, or describe what to build...",
  disabled = false,
  handleRef,
}: {
  onSubmit: (value: string) => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  handleRef?: Ref<InputBarHandle>;
}) {
  const { theme } = useTheme();
  const inputRef = useRef<InputRenderable>(null);

  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    onChange?.("");
  };

  useImperativeHandle(handleRef, () => ({ clear }));

  // OpenTUI's JSX namespace extends React's, so the intrinsic <input> merges
  // OpenTUI's onSubmit(value: string) with the DOM form handler. Taking
  // `unknown` satisfies both signatures; only the string form ever fires here.
  const handleSubmit = (raw: unknown) => {
    if (typeof raw !== "string" || disabled) return;

    const trimmed = raw.trim();
    if (!trimmed) return;

    onSubmit(trimmed);
    clear();
  };

  return (
    <box
      flexDirection="row"
      // One row of text between two border rows. Without a fixed height the
      // transcript above squeezes the bar and the text is drawn over the
      // bottom border.
      height={3}
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={disabled ? theme.border : theme.borderFocus}
      backgroundColor={theme.panel}
      paddingX={1}
    >
      <text fg={theme.accent}>{"> "}</text>
      <input
        ref={inputRef}
        flexGrow={1}
        focused={!disabled}
        placeholder={placeholder}
        backgroundColor={theme.panel}
        onInput={(value: string) => onChange?.(value)}
        onSubmit={handleSubmit}
      />
    </box>
  );
}
