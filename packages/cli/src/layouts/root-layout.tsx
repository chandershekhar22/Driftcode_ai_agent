import { Outlet, useLocation } from "react-router";

import { Header } from "../components/header.tsx";
import { StatusBar } from "../components/status-bar.tsx";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

const GLOBAL_HINTS = [
  { key: "ctrl+t", label: "theme" },
  { key: "ctrl+c", label: "quit" },
] as const;

/**
 * Hints are derived from the route rather than registered by screens. One
 * place to read, and a screen cannot forget to clean up after itself.
 */
function hintsForPath(pathname: string) {
  if (pathname === "/") {
    return [{ key: "enter", label: "select" }, ...GLOBAL_HINTS];
  }

  if (pathname === "/new") {
    return [
      { key: "enter", label: "start" },
      { key: "esc", label: "back" },
      ...GLOBAL_HINTS,
    ];
  }

  return [
    { key: "enter", label: "send" },
    { key: "esc", label: "sessions" },
    ...GLOBAL_HINTS,
  ];
}

/**
 * The frame every screen renders inside: a fixed header, a body that takes all
 * remaining height, and a fixed footer. Screens only ever fill the body, so
 * they never have to think about the chrome around them.
 */
export function RootLayout() {
  const { theme } = useTheme();
  const { version, cwdLabel, model, connection } = useAppConfig();
  const { pathname } = useLocation();

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.bg}
    >
      <Header cwd={cwdLabel} version={version} />
      <box flexGrow={1} flexDirection="column" paddingX={1} paddingBottom={1}>
        <Outlet />
      </box>
      <StatusBar
        model={model.label}
        connection={connection}
        hints={hintsForPath(pathname)}
      />
    </box>
  );
}
