import { useState, type ReactNode } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { RouterProvider } from "react-router";

import type { DriftConfig } from "./lib/config.ts";
import type { SessionsClient } from "./lib/sessions-api.ts";
import { createAppRouter } from "./router.tsx";
import {
  AppConfigProvider,
  type AppConfig,
} from "./providers/app-config/index.tsx";
import {
  ConfigProvider,
  useConfig,
  type PersistConfig,
} from "./providers/config/index.tsx";
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

/**
 * Sits between the config and theme providers so that cycling the theme is
 * written straight back to ~/.drift/config.json.
 */
function ThemedRoot({
  initialTheme,
  children,
}: {
  initialTheme?: string;
  children: ReactNode;
}) {
  const { setPreferredTheme } = useConfig();

  return (
    <ThemeProvider initial={initialTheme} onChange={setPreferredTheme}>
      {children}
    </ThemeProvider>
  );
}

export function App({
  config,
  initialTheme,
  initialEntries,
  initialConfig,
  persistConfig,
  /** Tests pass an in-memory implementation; production uses the HTTP one. */
  sessionsClient,
}: {
  config: AppConfig;
  initialTheme?: string;
  initialEntries?: string[];
  initialConfig?: DriftConfig;
  persistConfig?: PersistConfig;
  sessionsClient?: SessionsClient;
}) {
  // Built exactly once. A useMemo keyed on `initialEntries` would rebuild the
  // router on every render whenever a caller passes an inline array, which
  // remounts the whole tree and loses navigation history.
  const [router] = useState(() => createAppRouter(initialEntries));

  return (
    <ConfigProvider initial={initialConfig} persist={persistConfig}>
      <ThemedRoot initialTheme={initialTheme}>
        <AppConfigProvider config={config}>
          <SessionsProvider
            client={sessionsClient}
            enabled={config.connection === "connected"}
          >
            <GlobalKeys />
            <RouterProvider router={router} />
          </SessionsProvider>
        </AppConfigProvider>
      </ThemedRoot>
    </ConfigProvider>
  );
}
