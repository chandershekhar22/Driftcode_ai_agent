import { useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { RouterProvider } from "react-router";

import { createAppRouter } from "./router.tsx";
import {
  AppConfigProvider,
  type AppConfig,
} from "./providers/app-config/index.tsx";
import { SessionsProvider } from "./providers/sessions/index.tsx";
import { ThemeProvider, useTheme } from "./providers/theme/index.tsx";

/**
 * Keys that work on every screen. Screen-local keys (esc, enter) are handled
 * by the screens themselves.
 */
function GlobalKeys() {
  const renderer = useRenderer();
  const { cycleTheme } = useTheme();

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      process.exit(0);
    }

    if (key.ctrl && key.name === "t") {
      cycleTheme();
    }
  });

  return null;
}

export function App({
  config,
  initialTheme,
  initialEntries,
}: {
  config: AppConfig;
  initialTheme?: string;
  initialEntries?: string[];
}) {
  // Built exactly once. A useMemo keyed on `initialEntries` would rebuild the
  // router on every render whenever a caller passes an inline array, which
  // remounts the whole tree and loses navigation history.
  const [router] = useState(() => createAppRouter(initialEntries));

  return (
    <ThemeProvider initial={initialTheme}>
      <AppConfigProvider config={config}>
        <SessionsProvider>
          <GlobalKeys />
          <RouterProvider router={router} />
        </SessionsProvider>
      </AppConfigProvider>
    </ThemeProvider>
  );
}
