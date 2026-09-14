import { useMemo, useRef, useState } from "react";
import type { InputRenderable } from "@opentui/core";

import { useGatedKeyboard } from "../providers/keyboard-layer/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

/**
 * The body every dialog shares: a search box over a list you drive with the
 * arrow keys.
 *
 * The list is rendered by hand rather than with <select> because the search
 * input needs to keep focus while the arrows move the selection - a focused
 * <select> would swallow them, and a blurred one would not move at all.
 */

export interface SearchItem {
  id: string;
  name: string;
  description?: string;
  /** Extra text that should match a query without being displayed. */
  keywords?: string;
  /** Shown dimmed and refused on enter. */
  disabled?: boolean;
  disabledReason?: string;
}

/** Case-insensitive substring match across name, description and keywords. */
export function filterItems(
  items: readonly SearchItem[],
  query: string,
): SearchItem[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...items];

  return items.filter((item) =>
    `${item.name} ${item.description ?? ""} ${item.keywords ?? ""}`
      .toLowerCase()
      .includes(needle),
  );
}

/** How many rows fit without pushing the dialog off a small terminal. */
const MAX_VISIBLE = 8;

export function DialogSearchList({
  items,
  onSelect,
  onClose,
  placeholder = "Type to filter...",
  emptyLabel = "Nothing matches.",
  footer,
}: {
  items: readonly SearchItem[];
  onSelect: (item: SearchItem) => void;
  onClose: () => void;
  placeholder?: string;
  emptyLabel?: string;
  footer?: string;
}) {
  const { theme } = useTheme();
  const inputRef = useRef<InputRenderable>(null);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const filtered = useMemo(() => filterItems(items, query), [items, query]);

  // The cursor is clamped rather than reset, so narrowing a search keeps the
  // selection somewhere sensible instead of jumping to the top every keystroke.
  const index = Math.min(cursor, Math.max(filtered.length - 1, 0));
  const selected = filtered[index];

  // Scroll the window so the cursor is always on screen.
  const start = Math.max(
    0,
    Math.min(index - Math.floor(MAX_VISIBLE / 2), filtered.length - MAX_VISIBLE),
  );
  const visible = filtered.slice(start, start + MAX_VISIBLE);

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

    if (key.name === "return") {
      if (selected && !selected.disabled) onSelect(selected);
    }
  });

  return (
    <box flexDirection="column" flexGrow={1}>
      <box
        flexDirection="row"
        flexShrink={0}
        height={3}
        border
        borderStyle="rounded"
        borderColor={theme.borderFocus}
        backgroundColor={theme.panel}
        paddingX={1}
      >
        <text fg={theme.accent}>{"/ "}</text>
        <input
          ref={inputRef}
          flexGrow={1}
          focused
          placeholder={placeholder}
          backgroundColor={theme.panel}
          onInput={(value: string) => {
            setQuery(value);
            setCursor(0);
          }}
        />
      </box>

      <box flexDirection="column" flexGrow={1} paddingX={1}>
        {filtered.length === 0 ? (
          <text fg={theme.muted} flexShrink={0}>
            {emptyLabel}
          </text>
        ) : (
          visible.map((item) => {
            const active = item.id === selected?.id;

            return (
              <box key={item.id} flexDirection="column" flexShrink={0}>
                <text flexShrink={0}>
                  <span fg={active ? theme.accent : theme.border}>
                    {active ? "> " : "  "}
                  </span>
                  <span fg={item.disabled ? theme.muted : theme.text}>
                    {item.name}
                  </span>
                  {item.disabled && item.disabledReason ? (
                    <span fg={theme.muted}>{` - ${item.disabledReason}`}</span>
                  ) : null}
                </text>
                {active && item.description ? (
                  <text fg={theme.muted} flexShrink={0}>
                    {`    ${item.description}`}
                  </text>
                ) : null}
              </box>
            );
          })
        )}

        {filtered.length > visible.length ? (
          <text fg={theme.border} flexShrink={0}>
            {`  ... ${filtered.length - visible.length} more`}
          </text>
        ) : null}
      </box>

      <text fg={theme.muted} flexShrink={0}>
        {footer ?? "enter select   up/down move   esc close"}
      </text>
    </box>
  );
}
