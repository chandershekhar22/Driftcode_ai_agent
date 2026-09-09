import { createMiddleware } from "hono/factory";
import { isDatabaseConfigured } from "@driftcode/database";

/**
 * Guards routes that cannot work without Postgres. Returning a specific,
 * actionable error beats letting Prisma throw a connection error the CLI would
 * have to guess at.
 */
export const requireDatabase = createMiddleware(async (c, next) => {
  if (!isDatabaseConfigured) {
    return c.json(
      {
        error: {
          code: "database_not_configured",
          message:
            "The server has no DATABASE_URL. Add a Postgres connection string to .env and restart it.",
        },
      },
      503,
    );
  }

  await next();
});
