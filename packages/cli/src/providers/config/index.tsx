import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { writeConfig, type DriftConfig } from "../../lib/config.ts";

/**
 * Preferences, and the job of writing them back to disk.
 *
 * Saves are fire-and-forget: the in-memory value updates immediately so the UI
 * never waits on a file write, and a failed write costs a preference rather
 * than a session. `persist` is injectable so tests do not touch the home
 * directory.
 */

interface ConfigContextValue {
  config: DriftConfig;
  setPreferredModel: (model: string) => void;
  setPreferredTheme: (theme: string) => void;
  rememberSession: (sessionId: string) => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export type PersistConfig = (patch: DriftConfig) => Promise<unknown>;

export function ConfigProvider({
  children,
  initial = {},
  persist = writeConfig,
}: {
  children: ReactNode;
  initial?: DriftConfig;
  persist?: PersistConfig;
}) {
  const [config, setConfig] = useState<DriftConfig>(initial);

  const update = useCallback(
    (patch: DriftConfig) => {
      setConfig((current) => ({ ...current, ...patch }));
      void persist(patch).catch(() => {});
    },
    [persist],
  );

  // These must not change identity when `config` does. Callers put them in
  // effect dependency lists - a setter that is recreated on every save would
  // re-run the effect that just triggered the save, forever.
  const setPreferredModel = useCallback(
    (model: string) => update({ model }),
    [update],
  );

  const setPreferredTheme = useCallback(
    (theme: string) => update({ theme }),
    [update],
  );

  const rememberSession = useCallback(
    (lastSessionId: string) => update({ lastSessionId }),
    [update],
  );

  const value = useMemo<ConfigContextValue>(
    () => ({ config, setPreferredModel, setPreferredTheme, rememberSession }),
    [config, setPreferredModel, setPreferredTheme, rememberSession],
  );

  return <ConfigContext value={value}>{children}</ConfigContext>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);

  if (!context) {
    throw new Error("useConfig must be used inside a <ConfigProvider>.");
  }

  return context;
}
