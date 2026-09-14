import {
  authStartSchema,
  authStatusSchema,
  authTokenSchema,
  type AuthStatus,
  type AuthToken,
} from "@driftcode/shared";

import { apiRequest, setAuthToken } from "./api-client.ts";
import { clearAuth, readAuth, writeAuth } from "./auth-store.ts";
import { createPkce, listenForCallback, openBrowser } from "./oauth.ts";

/** What the server says about auth, and who it thinks we are. */
export function fetchAuthStatus(): Promise<AuthStatus> {
  return apiRequest("/auth/status", authStatusSchema);
}

/** Loads any stored token into the api client. Call once at startup. */
export async function restoreSession(): Promise<void> {
  const stored = await readAuth();
  setAuthToken(stored?.token ?? null);
}

export async function signOut(): Promise<void> {
  setAuthToken(null);
  await clearAuth();
}

export interface SignInHandle {
  /** Printed as a fallback when no browser opens. */
  url: string;
  /** Resolves once the token is stored and in use. */
  completed: Promise<AuthToken>;
  cancel: () => void;
}

/**
 * Runs the whole browser sign-in.
 *
 * Returns as soon as the browser has been opened, with a promise for the rest,
 * so the caller can render "waiting for your browser" instead of freezing.
 */
export async function startSignIn(): Promise<SignInHandle> {
  const pkce = await createPkce();
  const listener = listenForCallback();

  let start;
  try {
    start = await apiRequest("/auth/start", authStartSchema, {
      method: "POST",
      body: { codeChallenge: pkce.challenge, port: listener.port },
    });
  } catch (error) {
    listener.close();
    throw error;
  }

  openBrowser(start.authorizeUrl);

  const completed = (async () => {
    try {
      const code = await listener.code;

      const result = await apiRequest("/auth/exchange", authTokenSchema, {
        method: "POST",
        body: { code, codeVerifier: pkce.verifier },
      });

      // Order matters: the token is in use before it is written, so a failed
      // write costs the next run a sign-in rather than breaking this one.
      setAuthToken(result.token);
      await writeAuth({
        token: result.token,
        email: result.user.email,
        name: result.user.name,
      });

      return result;
    } finally {
      listener.close();
    }
  })();

  return { url: start.authorizeUrl, completed, cancel: listener.close };
}
