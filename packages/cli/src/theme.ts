/**
 * Colour is the only styling primitive a terminal really gives us, so every
 * component pulls its colours from here rather than hardcoding hex values.
 * Adding a theme is a matter of adding one entry to `THEMES`.
 */

export interface Theme {
  name: string;
  label: string;
  /** Page background. */
  bg: string;
  /** Slightly raised surfaces - panels, the input bar, the status bar. */
  panel: string;
  border: string;
  borderFocus: string;
  /** Primary body text. */
  text: string;
  /** Labels, hints, timestamps - anything secondary. */
  muted: string;
  /** Brand colour: the wordmark, the caret, active state. */
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

export const THEMES: readonly Theme[] = [
  {
    name: "midnight",
    label: "Midnight",
    bg: "#0d1017",
    panel: "#151a23",
    border: "#252c38",
    borderFocus: "#7c6cf0",
    text: "#d5dae3",
    muted: "#6b7484",
    accent: "#9d8cff",
    success: "#5cc98a",
    warning: "#e3b341",
    danger: "#f2686c",
  },
  {
    name: "ember",
    label: "Ember",
    bg: "#12100e",
    panel: "#1b1815",
    border: "#2e2823",
    borderFocus: "#e8804a",
    text: "#e6ded4",
    muted: "#7d7266",
    accent: "#f0955e",
    success: "#8fbf6a",
    warning: "#e8c05a",
    danger: "#e46060",
  },
  {
    name: "paper",
    label: "Paper",
    bg: "#f5f3ee",
    panel: "#ebe8e1",
    border: "#d3cec3",
    borderFocus: "#3f6ec4",
    text: "#26241f",
    muted: "#7a7469",
    accent: "#3f6ec4",
    success: "#2f7d4f",
    warning: "#9a6b16",
    danger: "#b23b3b",
  },
] as const;

export const DEFAULT_THEME = "midnight";

export function resolveTheme(name: string | undefined): Theme {
  const match = name ? THEMES.find((theme) => theme.name === name) : undefined;
  return match ?? THEMES.find((theme) => theme.name === DEFAULT_THEME)!;
}

/** Next theme in the list, wrapping - drives the cycle keybinding. */
export function nextTheme(current: Theme): Theme {
  const index = THEMES.findIndex((theme) => theme.name === current.name);
  return THEMES[(index + 1) % THEMES.length]!;
}
