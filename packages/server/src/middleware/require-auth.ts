import { createMiddleware } from "hono/factory";
import type { User } from "@driftcode/database";
import { getPrisma } from "@driftcode/database";

import { authConfigured, localUser, readToken } from "../lib/auth.ts";

/**
 * Puts the current user on the context.
 *
 * With auth configured this demands a valid bearer token. Without it, every
 * request is the local user - the same code path downstream, so routes never
 * have to ask which mode the server is in.
 */
export const requireAuth = createMiddleware<{
  Variables: { user: User };
}>(async (c, next) => {
  if (!authConfigured()) {
    c.set("user", await localUser());
    await next();
    return;
  }

  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return c.json(
      {
        error: {
          code: "unauthenticated",
          message: "Sign in first - run /login in the CLI.",
        },
      },
      401,
    );
  }

  const userId = await readToken(token);
  const user = userId
    ? await getPrisma().user.findUnique({ where: { id: userId } })
    : null;

  // A token can verify and still name nobody, if the account was deleted.
  if (!user) {
    return c.json(
      {
        error: {
          code: "unauthenticated",
          message: "That sign-in has expired. Run /login again.",
        },
      },
      401,
    );
  }

  c.set("user", user);
  await next();
});
