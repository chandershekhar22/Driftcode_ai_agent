import {
  balanceSchema,
  checkoutSchema,
  type Balance,
} from "@driftcode/shared";

import { apiRequest } from "./api-client.ts";
import { openBrowser } from "./oauth.ts";

/** Billing is off unless the server says otherwise. */
export const UNMETERED: Balance = { configured: false, credits: null };

export function fetchBalance(): Promise<Balance> {
  // A balance is decoration; a server that cannot report one should not stop
  // the CLI from starting.
  return apiRequest("/billing/balance", balanceSchema).catch(() => UNMETERED);
}

/** Opens a checkout page and returns the URL, for printing as a fallback. */
export async function startCheckout(): Promise<string> {
  const { url } = await apiRequest("/billing/checkout", checkoutSchema, {
    method: "POST",
  });

  openBrowser(url);
  return url;
}
