import { createMiddleware } from "hono/factory";
import type { User } from "@driftcode/database";

import { billingConfigured, creditBalance } from "../lib/polar.ts";

/**
 * Refuses a turn when the balance is empty.
 *
 * Checked before the model runs, so someone out of credits is told plainly
 * rather than having a reply cut off partway. When billing is unconfigured
 * this does nothing at all - an unmetered server has no balance to be out of.
 */
export const requireCredits = createMiddleware<{
  Variables: { user: User };
}>(async (c, next) => {
  if (!billingConfigured()) {
    await next();
    return;
  }

  let balance: number | null;

  try {
    balance = await creditBalance(c.get("user"));
  } catch {
    // The billing provider being unreachable should not stop someone working.
    // Failing open costs at most a few turns; failing closed makes an outage
    // at Polar an outage here.
    await next();
    return;
  }

  if (balance !== null && balance <= 0) {
    return c.json(
      {
        error: {
          code: "out_of_credits",
          message: "You are out of credits. Run /upgrade to buy more.",
        },
      },
      402,
    );
  }

  await next();
});
