import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Transient feedback.
 *
 * For things the user should notice but need not act on - "switched to build
 * mode", "session deleted". Anything that needs a decision is a Notice or a
 * dialog instead, because a message that disappears on its own is the wrong
 * place to put a question.
 */

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toasts: readonly Toast[];
  toast: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 2_600;

export function ToastProvider({
  children,
  /** Tests disable the timer so a toast does not vanish mid-assertion. */
  autoDismiss = true,
}: {
  children: ReactNode;
  autoDismiss?: boolean;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // A toast outliving its screen would fire setState on an unmounted tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);

      if (!autoDismiss) return;

      const timer = setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, VISIBLE_MS);

      timers.current.add(timer);
    },
    [autoDismiss, dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss],
  );

  return <ToastContext value={value}>{children}</ToastContext>;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside a <ToastProvider>.");
  }

  return context;
}
