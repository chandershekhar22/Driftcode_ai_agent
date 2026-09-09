import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client.ts";

/**
 * The Postgres connection.
 *
 * A missing DATABASE_URL is not fatal: the server still boots and reports
 * `database: false` on /health, so the CLI can explain the problem instead of
 * the whole process dying at import time. Routes that need the database say so
 * individually.
 */

const databaseUrl = process.env.DATABASE_URL;

export const isDatabaseConfigured = Boolean(databaseUrl && databaseUrl.length > 0);

let client: PrismaClient | null = null;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Add a Postgres connection string to .env - see .env.example.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

/** Lazily built so that importing this module never opens a connection. */
export function getPrisma(): PrismaClient {
  if (!isDatabaseConfigured) {
    throw new DatabaseNotConfiguredError();
  }

  if (!client) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    client = new PrismaClient({ adapter });
  }

  return client;
}

/** Cheap liveness probe for /health. Never throws. */
export async function pingDatabase(): Promise<boolean> {
  if (!isDatabaseConfigured) return false;

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
