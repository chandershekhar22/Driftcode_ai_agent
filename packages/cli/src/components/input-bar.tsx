import { useState } from "react";

import { useTheme } from "../providers/theme/index.tsx";

/**
 * The prompt line. Owns nothing but its draft text - submitting hands the
 * value up and clears, so the parent decides what a submission means.
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
  const [value, setValue] = useState("");

  // OpenTUI's JSX namespace extends React's, so the intrinsic <input> merges
  // OpenTUI's onSubmit(value: string) with the DOM form handler. Taking
  // `unknown` satisfies both signatures; only the string form ever fires here.
  const handleSubmit = (raw: unknown) => {
    if (typeof raw !== "string" || disabled) return;

    const trimmed = raw.trim();
    if (!trimmed) return;

    onSubmit(trimmed);
    setValue("");
  };

  return (
    <box
      flexDirection="row"
      border
      borderStyle="rounded"
      borderColor={disabled ? theme.border : theme.borderFocus}
      backgroundColor={theme.panel}
      paddingX={1}
    >
      <text fg={theme.accent}>{"> "}</text>
      <input
        flexGrow={1}
        focused={!disabled}
        value={value}
        placeholder={placeholder}
        backgroundColor={theme.panel}
        onInput={setValue}
        onSubmit={handleSubmit}
      />
    </box>
  );
}
