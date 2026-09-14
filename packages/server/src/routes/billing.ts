import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { User } from "@driftcode/database";

import { billingConfigured, createCheckout, creditBalance } from "../lib/polar.ts";
import { requireAuth } from "../middleware/require-auth.ts";
import { requireDatabase } from "../middleware/require-database.ts";

export const billingRoute = new Hono<{ Variables: { user: User } }>()
  .use("*", requireDatabase)
  .use("*", requireAuth)

  /**
   * Credits remaining.
   *
   * `credits: null` means billing is off - unlimited, not empty. The CLI shows
   * nothing at all in that case rather than "0 credits".
   */
  .get("/balance", async (c) => {
    if (!billingConfigured()) {
      return c.json({ configured: false, credits: null });
    }

    try {
      return c.json({
        configured: true,
        credits: await creditBalance(c.get("user")),
      });
    } catch {
      // An unreachable provider is not worth an error banner over a number
      // that is only ever decoration.
      return c.json({ configured: true, credits: null });
    }
  })

  .post("/checkout", async (c) => {
    if (!billingConfigured()) {
      throw new HTTPException(400, {
        message: "This server does not meter usage, so there is nothing to buy.",
      });
    }

    try {
      return c.json({ url: await createCheckout(c.get("user")) });
    } catch (cause) {
      throw new HTTPException(400, {
        message:
          cause instanceof Error
            ? cause.message
            : "Could not start a checkout.",
      });
    }
  });
