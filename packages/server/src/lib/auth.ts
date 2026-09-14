import { SignJWT, jwtVerify } from "jose";
import { getPrisma, type User } from "@driftcode/database";

import { env } from "./env.ts";

/**
 * Who is making a request.
 *
 * Auth is optional. With Clerk configured, people sign in and each has their
 * own sessions. Without it, the server runs single-user: there is one local
 * row that owns everything, and the API behaves identically. That keeps the
 * project usable before anyone sets up an identity provider, and means turning
 * auth on later is a configuration change rather than a rewrite.
 */

/**
 * Read at call time rather than snapshotted at import.
 *
 * env.ts validates process.env once at boot, which is what it is for. But a
 * module-level snapshot here also made this file depend on import order - it
 * had to load after env.ts had seen the variables - which is a fragile thing
 * for the auth layer to rely on. These read the same values, just later.
 */
function jwtSecret(): string | undefined {
  return process.env.JWT_SECRET ?? env.JWT_SECRET;
}

function frontendApi(): string | undefined {
  return process.env.CLERK_FRONTEND_API ?? env.CLERK_FRONTEND_API;
}

function clientId(): string | undefined {
  return process.env.CLERK_OAUTH_CLIENT_ID ?? env.CLERK_OAUTH_CLIENT_ID;
}

function clientSecret(): string | undefined {
  return process.env.CLERK_OAUTH_CLIENT_SECRET ?? env.CLERK_OAUTH_CLIENT_SECRET;
}

export function authConfigured(): boolean {
  return Boolean(frontendApi() && clientId() && jwtSecret());
}

/** Tokens last long enough not to nag, short enough to be worth revoking. */
const TOKEN_LIFETIME = "30d";

function secretKey(): Uint8Array {
  const secret = jwtSecret();

  if (!secret) {
    throw new Error("JWT_SECRET is required to issue tokens.");
  }

  return new TextEncoder().encode(secret);
}

export async function issueToken(user: User): Promise<string> {
  return new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("driftcode")
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(secretKey());
}

/** Returns the user id a token vouches for, or null if it does not. */
export async function readToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "driftcode",
    });

    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    // Expired, tampered with, or signed by a different JWT_SECRET. All of them
    // mean the same thing to a caller: sign in again.
    return null;
  }
}

/**
 * The single-user row, created on demand.
 *
 * Any sessions left without an owner are adopted at the same time - the userId
 * column was added nullable so it needed no data migration, and this is where
 * that debt is paid.
 */
export async function localUser(): Promise<User> {
  const prisma = getPrisma();

  const existing = await prisma.user.findFirst({ where: { clerkId: null } });
  if (existing) return existing;

  const created = await prisma.user.create({ data: {} });

  await prisma.session.updateMany({
    where: { userId: null },
    data: { userId: created.id },
  });

  return created;
}

// --- Clerk OAuth ----------------------------------------------------------

export interface ClerkProfile {
  clerkId: string;
  email?: string;
  name?: string;
}

function oauthUrl(path: string): string {
  const base = (frontendApi() ?? "").replace(/\/+$/, "");
  return `${base}${path}`;
}

export function authorizeUrl(options: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId() ?? "",
    redirect_uri: options.redirectUri,
    scope: "openid email profile",
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
  });

  return `${oauthUrl("/oauth/authorize")}?${params.toString()}`;
}

/**
 * Trades an authorization code for the user behind it.
 *
 * Done here rather than in the CLI so the client secret stays on the server -
 * a secret shipped to every machine running the CLI is not a secret.
 */
export async function exchangeCode(options: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<ClerkProfile> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: clientId() ?? "",
    code_verifier: options.codeVerifier,
    ...(clientSecret() ? { client_secret: clientSecret()! } : {}),
  });

  const tokenResponse = await fetch(oauthUrl("/oauth/token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text().catch(() => "");
    throw new Error(
      `The identity provider rejected the sign-in code (${tokenResponse.status}). ${detail.slice(0, 200)}`,
    );
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };

  if (!tokens.access_token) {
    throw new Error("The identity provider returned no access token.");
  }

  const userResponse = await fetch(oauthUrl("/oauth/userinfo"), {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userResponse.ok) {
    throw new Error("Could not read the account from the identity provider.");
  }

  const profile = (await userResponse.json()) as {
    sub?: string;
    user_id?: string;
    email?: string;
    name?: string;
    given_name?: string;
  };

  const clerkId = profile.sub ?? profile.user_id;

  if (!clerkId) {
    throw new Error("The identity provider returned an account with no id.");
  }

  return {
    clerkId,
    email: profile.email,
    name: profile.name ?? profile.given_name,
  };
}

/** Finds or creates the row for a signed-in account. */
export async function upsertClerkUser(profile: ClerkProfile): Promise<User> {
  return getPrisma().user.upsert({
    where: { clerkId: profile.clerkId },
    create: {
      clerkId: profile.clerkId,
      email: profile.email ?? null,
      name: profile.name ?? null,
    },
    // Kept fresh: people change their name and email at the provider.
    update: {
      email: profile.email ?? null,
      name: profile.name ?? null,
    },
  });
}
