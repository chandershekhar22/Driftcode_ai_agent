import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

import { configDir } from "./config.ts";

/**
 * The signed-in session, kept beside the config but in its own file.
 *
 * Separate because it is a credential: it has a different lifetime, it is the
 * thing to delete on logout, and keeping it out of config.json means a corrupt
 * preference file can never take the token with it.
 */

const storedAuthSchema = z.object({
  token: z.string(),
  /** Shown in the status bar without a round trip. */
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

export type StoredAuth = z.infer<typeof storedAuthSchema>;

export function authPath(dir: string = configDir()): string {
  return join(dir, "auth.json");
}

export async function readAuth(
  dir: string = configDir(),
): Promise<StoredAuth | null> {
  try {
    const parsed = storedAuthSchema.safeParse(
      JSON.parse(await readFile(authPath(dir), "utf8")),
    );

    return parsed.success ? parsed.data : null;
  } catch {
    // Missing or unreadable is simply "not signed in".
    return null;
  }
}

/** Written to a temporary file and renamed, so a crash cannot truncate it. */
export async function writeAuth(
  auth: StoredAuth,
  dir: string = configDir(),
): Promise<void> {
  const target = authPath(dir);
  const temporary = `${target}.${process.pid}.tmp`;

  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  } catch {
    // A token that could not be saved just means signing in again next run.
  }
}

export async function clearAuth(dir: string = configDir()): Promise<void> {
  await rm(authPath(dir), { force: true }).catch(() => {});
}
