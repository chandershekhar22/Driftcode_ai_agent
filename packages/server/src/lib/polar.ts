import { Polar } from "@polar-sh/sdk";
import { getPrisma, type User } from "@driftcode/database";

import { env } from "./env.ts";

/**
 * Credit metering.
 *
 * Optional, like auth. Unconfigured, the server meters nothing and everyone
 * has unlimited use - which is the right default for something you run
 * yourself. Configured, each turn is charged against a balance the user tops
 * up through a checkout link.
 *
 * Everything here reads its configuration at call time rather than at import,
 * so this file has no dependency on module load order (see lib/auth.ts for the
 * bug that taught us).
 */

/** The event the Polar meter is configured to filter on. */
export const USAGE_EVENT = "driftcode_usage";

function accessToken(): string | undefined {
  return process.env.POLAR_ACCESS_TOKEN ?? env.POLAR_ACCESS_TOKEN;
}

function meterId(): string | undefined {
  return process.env.POLAR_CREDITS_METER_ID ?? env.POLAR_CREDITS_METER_ID;
}

function productId(): string | undefined {
  return process.env.POLAR_PRODUCT_ID ?? env.POLAR_PRODUCT_ID;
}

function server(): "sandbox" | "production" {
  const value = process.env.POLAR_SERVER ?? env.POLAR_SERVER;
  return value === "production" ? "production" : "sandbox";
}

export function billingConfigured(): boolean {
  return Boolean(accessToken() && meterId());
}

function client(): Polar {
  const token = accessToken();

  if (!token) {
    throw new Error("POLAR_ACCESS_TOKEN is required for billing.");
  }

  return new Polar({ accessToken: token, server: server() });
}

/**
 * The Polar customer for this account, created on first need.
 *
 * Keyed by our own user id as the external id, so the two systems stay linked
 * even if the stored Polar id is ever lost.
 */
export async function ensureCustomer(user: User): Promise<string> {
  if (user.polarCustomerId) return user.polarCustomerId;

  const polar = client();

  const existing = await polar.customers
    .getExternal({ externalId: user.id })
    .catch(() => null);

  const customer =
    existing ??
    (await polar.customers.create({
      externalId: user.id,
      email: user.email ?? `${user.id}@drift.local`,
      name: user.name ?? undefined,
    }));

  await getPrisma().user.update({
    where: { id: user.id },
    data: { polarCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Credits remaining, or null when billing is off.
 *
 * Null means unlimited rather than empty - a caller that treated "not
 * configured" as "no credits" would lock everyone out of their own server.
 */
export async function creditBalance(user: User): Promise<number | null> {
  if (!billingConfigured()) return null;

  const customerId = await ensureCustomer(user);

  const meters = await client().customerMeters.list({
    customerId,
    meterId: meterId(),
  });

  for await (const page of meters) {
    for (const entry of page.result.items) {
      if (entry.meterId === meterId()) {
        return Math.floor(entry.balance);
      }
    }
  }

  // A customer who has never bought anything has no meter row yet.
  return 0;
}

/**
 * Reports what a turn consumed.
 *
 * Called after the turn, never before: charging for work that then failed is
 * worse than occasionally letting a turn finish on an empty balance.
 */
export async function recordUsage(user: User, credits: number): Promise<void> {
  if (!billingConfigured() || credits <= 0) return;

  const customerId = await ensureCustomer(user);

  await client().events.ingest({
    events: [
      {
        name: USAGE_EVENT,
        customerId,
        metadata: { credits },
      },
    ],
  });
}

/** A page where the user can buy more credits. */
export async function createCheckout(user: User): Promise<string> {
  const product = productId();

  if (!billingConfigured() || !product) {
    throw new Error(
      "This server has no credit product configured, so there is nothing to buy.",
    );
  }

  const customerId = await ensureCustomer(user);

  const checkout = await client().checkouts.create({
    products: [product],
    customerId,
  });

  return checkout.url;
}
