import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useRenderer } from "@opentui/react";

import { useDialog } from "../../providers/dialog/index.tsx";
import type { Command } from "./types.ts";

/**
 * Every command the menu offers, already wired to what it does.
 *
 * Commands are built here rather than declared as data and dispatched
 * elsewhere: each one needs navigation, a dialog or the renderer, and threading
 * a context object through would buy nothing.
 */
export function useCommands(): Command[] {
  const navigate = useNavigate();
  const { open } = useDialog();
  const renderer = useRenderer();

  return useMemo(
    () => [
      {
        name: "new",
        description: "Start a new session",
        keywords: "start chat conversation",
        run: () => navigate("/new"),
      },
      {
        name: "sessions",
        description: "Browse and search past sessions",
        keywords: "history resume open recent",
        run: () => open("sessions"),
      },
      {
        name: "models",
        description: "Choose the model",
        keywords: "opus sonnet haiku switch provider",
        run: () => open("models"),
      },
      {
        name: "agents",
        description: "Switch between plan and build mode",
        keywords: "mode plan build tools permission",
        run: () => open("agents"),
      },
      {
        name: "theme",
        description: "Change the colour theme",
        keywords: "colour color dark light appearance",
        run: () => open("theme"),
      },
      {
        name: "help",
        description: "Show the keyboard shortcuts",
        keywords: "keys keybindings shortcuts",
        run: () => open("help"),
      },
      {
        name: "quit",
        description: "Exit drift",
        keywords: "exit close bye",
        run: () => {
          renderer.destroy();
          process.exit(0);
        },
      },
    ],
    [navigate, open, renderer],
  );
}
