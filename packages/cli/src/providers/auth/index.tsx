import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthStatus, AuthUser } from "@driftcode/shared";

import { signOut as clearSession, startSignIn } from "../../lib/auth-api.ts";

/**
 * Who is signed in, if anyone.
 *
 * `configured: false` means the server has no identity provider, so the CLI
 * hides the sign-in commands entirely rather than offering something that
 * cannot work.
 */

interface AuthContextValue {
  configured: boolean;
  user: AuthUser | null;
  /** True while a browser sign-in is in flight. */
  pending: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: AuthStatus;
}) {
  const [user, setUser] = useState<AuthUser | null>(initial.user);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const handle = await startSignIn();
      const result = await handle.completed;
      setUser(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  }, [pending]);

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: initial.configured,
      user,
      pending,
      error,
      signIn,
      signOut,
    }),
    [initial.configured, user, pending, error, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an <AuthProvider>.");
  }

  return context;
}

/** A short label for the status bar: a name, an email, or nothing. */
export function describeUser(user: AuthUser | null): string | null {
  if (!user || !user.authenticated) return null;
  return user.name ?? user.email ?? "signed in";
}
