import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { User } from "@driftcode/database";
import {
  authExchangeRequestSchema,
  authStartRequestSchema,
  type AuthUser,
} from "@driftcode/shared";

import {
  authConfigured,
  authorizeUrl,
  exchangeCode,
  issueToken,
  localUser,
  readToken,
  upsertClerkUser,
} from "../lib/auth.ts";
import { env } from "../lib/env.ts";
import { validate } from "../lib/validator.ts";
import { requireDatabase } from "../middleware/require-database.ts";

/**
 * The sign-in flow.
 *
 * The browser cannot be sent to a random localhost port - a redirect URI has
 * to be registered with the provider in advance, and the CLI picks its port at
 * runtime. So the provider redirects here, and this bounces the browser on to
 * whichever port the CLI is listening on. The code is then redeemed by the
 * server, not the CLI, so the client secret never leaves this machine.
 */

/** Pending sign-ins, so a callback can find the CLI that started it. */
const pending = new Map<string, { port: number; expiresAt: number }>();

const PENDING_TTL_MS = 10 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [state, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(state);
  }
}

export function serializeUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    // The local row is an owner, not an identity - nobody signed in as it.
    authenticated: user.clerkId !== null,
  };
}

/** Where the provider is told to send the browser back to. */
function callbackUri(): string {
  return `${env.PUBLIC_URL.replace(/\/+$/, "")}/auth/callback`;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"]/g, (char) =>
    char === "<"
      ? "&lt;"
      : char === ">"
        ? "&gt;"
        : char === "&"
          ? "&amp;"
          : "&quot;",
  );
}

/** A browser tab the user is about to close anyway. */
function page(title: string, detail: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></body>`;
}

export const authRoute = new Hono()
  .get("/status", async (c) => {
    if (!authConfigured()) {
      return c.json({
        configured: false,
        user: serializeUser(await localUser()),
      });
    }

    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const userId = token ? await readToken(token) : null;

    const user = userId
      ? await (await import("@driftcode/database")).getPrisma().user.findUnique({
          where: { id: userId },
        })
      : null;

    return c.json({
      configured: true,
      user: user ? serializeUser(user) : null,
    });
  })

  .use("/start", requireDatabase)
  .post("/start", validate("json", authStartRequestSchema), async (c) => {
    if (!authConfigured()) {
      throw new HTTPException(400, {
        message:
          "This server has no identity provider configured, so there is nothing to sign in to.",
      });
    }

    const { codeChallenge, port } = c.req.valid("json");

    sweep();

    const state = crypto.randomUUID();
    pending.set(state, { port, expiresAt: Date.now() + PENDING_TTL_MS });

    return c.json({
      authorizeUrl: authorizeUrl({
        redirectUri: callbackUri(),
        state,
        codeChallenge,
      }),
      state,
    });
  })

  /** Where the provider sends the browser. Bounces it on to the CLI. */
  .get("/callback", (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.html(
        page("Sign-in failed", `The identity provider reported: ${error}`),
        400,
      );
    }

    const entry = state ? pending.get(state) : undefined;

    if (!code || !entry) {
      return c.html(
        page(
          "Sign-in expired",
          "That sign-in link is no longer valid. Run /login again.",
        ),
        400,
      );
    }

    pending.delete(state!);

    // Back to the waiting CLI, which holds the PKCE verifier.
    const target = new URL(`http://127.0.0.1:${entry.port}/callback`);
    target.searchParams.set("code", code);

    return c.redirect(target.toString(), 302);
  })

  .use("/exchange", requireDatabase)
  .post("/exchange", validate("json", authExchangeRequestSchema), async (c) => {
    if (!authConfigured()) {
      throw new HTTPException(400, {
        message: "This server has no identity provider configured.",
      });
    }

    const { code, codeVerifier } = c.req.valid("json");

    let profile;
    try {
      profile = await exchangeCode({
        code,
        codeVerifier,
        redirectUri: callbackUri(),
      });
    } catch (cause) {
      throw new HTTPException(400, {
        message:
          cause instanceof Error ? cause.message : "Could not complete sign-in.",
      });
    }

    const user = await upsertClerkUser(profile);

    return c.json({ token: await issueToken(user), user: serializeUser(user) });
  });
