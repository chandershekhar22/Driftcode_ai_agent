import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { nextTheme, resolveTheme, type Theme } from "../../theme.ts";

interface ThemeContextValue {
  theme: Theme;
  /** Advance to the next theme in the list. Bound to a key in the app shell. */
  cycleTheme: () => void;
  setTheme: (name: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initial,
  onChange,
}: {
  children: ReactNode;
  initial?: string;
  /** Called whenever the theme changes, so it can be remembered. */
  onChange?: (name: string) => void;
}) {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme(initial));

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = nextTheme(current);
      onChange?.(next.name);
      return next;
    });
  }, [onChange]);

  const setTheme = useCallback(
    (name: string) => {
      const next = resolveTheme(name);
      setThemeState(next);
      onChange?.(next.name);
    },
    [onChange],
  );

  const value = useMemo(
    () => ({ theme, cycleTheme, setTheme }),
    [theme, cycleTheme, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside a <ThemeProvider>.");
  }

  return context;
}
