import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ModelSpec } from "@driftcode/shared";

import type { ConnectionState } from "../../components/status-bar.tsx";

/**
 * Facts about this run that every screen may need. Set once at startup and
 * never changed, so it lives in a context rather than being threaded through
 * the router as props.
 */
export interface AppConfig {
  version: string;
  /** Absolute path of the project - what the server stores. */
  cwd: string;
  /** The same path shortened for the header. */
  cwdLabel: string;
  model: ModelSpec;
  connection: ConnectionState;
  serverDescription: string;
}

const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({
  config,
  children,
}: {
  config: AppConfig;
  children: ReactNode;
}) {
  const value = useMemo(() => config, [config]);

  return <AppConfigContext value={value}>{children}</AppConfigContext>;
}

export function useAppConfig(): AppConfig {
  const context = useContext(AppConfigContext);

  if (!context) {
    throw new Error("useAppConfig must be used inside an <AppConfigProvider>.");
  }

  return context;
}
