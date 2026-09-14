import { useState, type ReactNode } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { RouterProvider } from "react-router";

import type { AuthStatus, Balance } from "@driftcode/shared";

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
import { AuthProvider } from "./providers/auth/index.tsx";
import { BillingProvider } from "./providers/billing/index.tsx";
import { DialogProvider } from "./providers/dialog/index.tsx";
import { SessionsProvider } from "./providers/sessions/index.tsx";
import { ToastProvider } from "./providers/toast/index.tsx";
import { ThemeProvider, useTheme } from "./providers/theme/index.tsx";

/**
 * Keys that work everywhere, dialogs included.
 *
 * Deliberately outside the layer system: quitting must work no matter what is
 * on screen, and cycling the theme is harmless from anywhere.
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
  autoDismissToasts = true,
  authStatus = { configured: false, user: null },
  balance = { configured: false, credits: null },
}: {
  config: AppConfig;
  initialTheme?: string;
  initialEntries?: string[];
  initialConfig?: DriftConfig;
  persistConfig?: PersistConfig;
  sessionsClient?: SessionsClient;
  /** Tests hold toasts still so they can be asserted on. */
  autoDismissToasts?: boolean;
  /** Defaults to single-user, which is what an unconfigured server reports. */
  authStatus?: AuthStatus;
  /** Defaults to unmetered, which is what an unconfigured server reports. */
  balance?: Balance;
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
              <ToastProvider autoDismiss={autoDismissToasts}>
                <AuthProvider initial={authStatus}>
                  <BillingProvider initial={balance}>
                    <DialogProvider>
                  <GlobalKeys />
                  <RouterProvider router={router} />
                    </DialogProvider>
                  </BillingProvider>
                </AuthProvider>
              </ToastProvider>
          </SessionsProvider>
        </AppConfigProvider>
      </ThemedRoot>
    </ConfigProvider>
  );
}
