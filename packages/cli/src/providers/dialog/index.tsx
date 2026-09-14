import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { DialogKind, DialogState } from "./types.ts";

/**
 * The dialog currently open, if any.
 *
 * Only one at a time: a terminal has no room to stack them, and nesting would
 * make "esc" ambiguous. Opening a second replaces the first.
 */

interface DialogContextValue {
  dialog: DialogState | null;
  open: (kind: DialogKind) => void;
  close: () => void;
  isOpen: boolean;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({
  children,
  initial = null,
}: {
  children: ReactNode;
  /** Tests can mount straight into a dialog. */
  initial?: DialogState | null;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(initial);

  const open = useCallback((kind: DialogKind) => setDialog({ kind }), []);
  const close = useCallback(() => setDialog(null), []);

  const value = useMemo<DialogContextValue>(
    () => ({ dialog, open, close, isOpen: dialog !== null }),
    [dialog, open, close],
  );

  return <DialogContext value={value}>{children}</DialogContext>;
}

export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error("useDialog must be used inside a <DialogProvider>.");
  }

  return context;
}

export type { DialogKind, DialogState };
