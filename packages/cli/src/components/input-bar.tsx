import { useRef } from "react";
import type { InputRenderable } from "@opentui/core";

import { useTheme } from "../providers/theme/index.tsx";

/**
 * The prompt line.
 *
 * The input is uncontrolled: the renderable owns the draft text and we clear it
 * through a ref after submitting. Mirroring it into React state would re-render
 * the whole screen on every keystroke, and a React value that never changes
 * pushes no update to the renderable - so the field would never clear.
 */
export function InputBar({
  onSubmit,
  placeholder = "Ask anything, or describe what to build...",
  disabled = false,
}: {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const inputRef = useRef<InputRenderable>(null);

  // OpenTUI's JSX namespace extends React's, so the intrinsic <input> merges
  // OpenTUI's onSubmit(value: string) with the DOM form handler. Taking
  // `unknown` satisfies both signatures; only the string form ever fires here.
  const handleSubmit = (raw: unknown) => {
    if (typeof raw !== "string" || disabled) return;

    const trimmed = raw.trim();
    if (!trimmed) return;

    onSubmit(trimmed);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
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
        onSubmit={handleSubmit}
      />
    </box>
  );
}
