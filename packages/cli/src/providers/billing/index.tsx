import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Balance } from "@driftcode/shared";

import { fetchBalance } from "../../lib/billing-api.ts";

/**
 * Credits remaining.
 *
 * `configured: false` means the server meters nothing, so the CLI shows no
 * balance at all rather than "0 credits" - unlimited and empty must never look
 * the same.
 */

interface BillingContextValue {
  balance: Balance;
  /** Re-reads the balance. Called after a turn, which is when it changes. */
  refresh: () => Promise<void>;
}

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: Balance;
}) {
  const [balance, setBalance] = useState<Balance>(initial);

  const refresh = useCallback(async () => {
    if (!initial.configured) return;

    setBalance(await fetchBalance());
  }, [initial.configured]);

  const value = useMemo<BillingContextValue>(
    () => ({ balance, refresh }),
    [balance, refresh],
  );

  return <BillingContext value={value}>{children}</BillingContext>;
}

export function useBilling(): BillingContextValue {
  const context = useContext(BillingContext);

  if (!context) {
    throw new Error("useBilling must be used inside a <BillingProvider>.");
  }

  return context;
}

/** A short label for the status bar, or nothing when unmetered. */
export function describeBalance(balance: Balance): string | null {
  if (!balance.configured || balance.credits === null) return null;

  return `${balance.credits} credit${balance.credits === 1 ? "" : "s"}`;
}
