import { z } from "zod";

/**
 * Billing contracts.
 *
 * Like auth, billing is optional: `configured: false` means the server is not
 * metering anything and the CLI should not show a balance or offer to buy
 * credits.
 */

export const balanceSchema = z.object({
  configured: z.boolean(),
  /** Null when billing is off - unlimited, not zero. */
  credits: z.number().int().nullable(),
});

export type Balance = z.infer<typeof balanceSchema>;

export const checkoutSchema = z.object({
  /** Opened in the user's browser. */
  url: z.string().url(),
});

export type Checkout = z.infer<typeof checkoutSchema>;
