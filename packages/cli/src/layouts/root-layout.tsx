import { Outlet, useLocation, useParams } from "react-router";
import { resolveModel } from "@driftcode/shared";

import { Header } from "../components/header.tsx";
import { StatusBar } from "../components/status-bar.tsx";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useSessions } from "../providers/sessions/index.tsx";
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
    return [
      { key: "enter", label: "select" },
      { key: "d", label: "delete" },
      ...GLOBAL_HINTS,
    ];
  }

  if (pathname.endsWith("/model")) {
    return [
      { key: "enter", label: "switch" },
      { key: "esc", label: "back" },
      ...GLOBAL_HINTS,
    ];
  }

  if (pathname === "/new") {
    return [
      { key: "enter", label: "start" },
      { key: "esc", label: "back" },
      ...GLOBAL_HINTS,
    ];
  }

  // Enter-to-send is obvious from the prompt; the bar has to fit on one row.
  return [
    { key: "shift+tab", label: "mode" },
    { key: "alt+m", label: "model" },
    { key: "esc", label: "back" },
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
  const { version, cwdLabel, model: defaultModel, connection } = useAppConfig();
  const { sessions } = useSessions();
  const { pathname } = useLocation();
  const { sessionId } = useParams<{ sessionId: string }>();

  // Inside a session the status bar must name that session's model, not the
  // app-wide default - they differ the moment anyone switches model.
  const activeSession = sessionId
    ? sessions.find((session) => session.id === sessionId)
    : undefined;

  const model = activeSession ? resolveModel(activeSession.model) : defaultModel;

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
        mode={activeSession?.mode}
        connection={connection}
        hints={hintsForPath(pathname)}
      />
    </box>
  );
}
