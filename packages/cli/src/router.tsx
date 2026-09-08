import { createMemoryRouter } from "react-router";

import { RootLayout } from "./layouts/root-layout.tsx";
import { HomeScreen } from "./screens/home.tsx";
import { NewSessionScreen } from "./screens/new-session.tsx";
import { SessionScreen } from "./screens/session.tsx";

/**
 * A memory router - there is no address bar in a terminal, but routing still
 * buys us history, params and a single place that names every screen.
 *
 * `initialEntries` exists so a caller can open straight onto a screen; the
 * resume-a-session flag in a later chapter uses it, and tests use it to render
 * a screen without driving the keyboard.
 */
export function createAppRouter(initialEntries: string[] = ["/"]) {
  return createMemoryRouter(
    [
      {
        path: "/",
        element: <RootLayout />,
        children: [
          { index: true, element: <HomeScreen /> },
          { path: "new", element: <NewSessionScreen /> },
          { path: "session/:sessionId", element: <SessionScreen /> },
        ],
      },
    ],
    { initialEntries },
  );
}
