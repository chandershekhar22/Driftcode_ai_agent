/**
 * Minimal ANSI helpers for the pre-TUI output in this chapter. Once the
 * OpenTUI renderer lands these are only used for startup and crash messages
 * printed before (or after) the full-screen UI is mounted.
 */

const supported = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

const wrap = (open: number, close: number) => (text: string) =>
  supported ? `\x1b[${open}m${text}\x1b[${close}m` : text;

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const violet = wrap(35, 39);
