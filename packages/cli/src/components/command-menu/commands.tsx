import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useRenderer } from "@opentui/react";

import { startCheckout } from "../../lib/billing-api.ts";
import { useAuth } from "../../providers/auth/index.tsx";
import { useBilling } from "../../providers/billing/index.tsx";
import { useDialog } from "../../providers/dialog/index.tsx";
import { useToast } from "../../providers/toast/index.tsx";
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
  const auth = useAuth();
  const billing = useBilling();
  const { toast } = useToast();

  return useMemo(
    () => [
      // Sign-in commands only exist when the server can actually do it; an
      // offer that always fails is worse than no offer.
      ...(auth.configured && !auth.user?.authenticated
        ? [
            {
              name: "login",
              description: "Sign in with your browser",
              keywords: "signin sign in account auth",
              run: () => {
                toast("Opening your browser...", "info");
                void auth.signIn();
              },
            },
          ]
        : []),
      ...(auth.configured && auth.user?.authenticated
        ? [
            {
              name: "logout",
              description: "Sign out of your account",
              keywords: "signout sign out",
              run: () => {
                void auth.signOut().then(() => toast("Signed out.", "success"));
              },
            },
          ]
        : []),
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
      // Only when the server actually meters usage; there is nothing to buy
      // on a server that does not charge.
      ...(billing.balance.configured
        ? [
            {
              name: "upgrade",
              description: "Buy more credits",
              keywords: "credits billing buy purchase top up",
              run: () => {
                toast("Opening checkout in your browser...", "info");
                void startCheckout()
                  .then(() => billing.refresh())
                  .catch((cause: unknown) =>
                    toast(
                      cause instanceof Error ? cause.message : String(cause),
                      "danger",
                    ),
                  );
              },
            },
          ]
        : []),
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
    [auth, billing, navigate, open, renderer, toast],
  );
}
