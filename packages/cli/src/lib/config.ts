import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

/**
 * Preferences that outlive a run, kept in ~/.drift/config.json.
 *
 * Everything is optional and every read falls back to defaults: a config file
 * that is missing, empty, corrupt, or written by a newer version must never
 * stop the CLI from starting. The file is a convenience, not a dependency.
 */

export const configSchema = z.object({
  /** Model used for new sessions. */
  model: z.string().optional(),
  theme: z.string().optional(),
  /** Resumed by `drift --resume`. */
  lastSessionId: z.string().optional(),
});

export type DriftConfig = z.infer<typeof configSchema>;

export const EMPTY_CONFIG: DriftConfig = {};

export function configDir(): string {
  return join(homedir(), ".drift");
}

export function configPath(dir: string = configDir()): string {
  return join(dir, "config.json");
}

export async function readConfig(
  dir: string = configDir(),
): Promise<DriftConfig> {
  let raw: string;

  try {
    raw = await readFile(configPath(dir), "utf8");
  } catch {
    return EMPTY_CONFIG;
  }

  try {
    const parsed = configSchema.safeParse(JSON.parse(raw));
    // Unknown keys are stripped rather than rejected, so a file written by a
    // newer version still yields the parts this version understands.
    return parsed.success ? parsed.data : EMPTY_CONFIG;
  } catch {
    return EMPTY_CONFIG;
  }
}

/**
 * Merge `patch` into the stored config and save it.
 *
 * Written to a temporary file and renamed, so an interrupted write leaves the
 * previous config intact rather than a half-written file the next run cannot
 * parse. Failures are swallowed: losing a preference is not worth crashing a
 * session over.
 */
export async function writeConfig(
  patch: DriftConfig,
  dir: string = configDir(),
): Promise<DriftConfig> {
  const current = await readConfig(dir);
  const next: DriftConfig = { ...current, ...patch };

  const target = configPath(dir);
  const temporary = `${target}.${process.pid}.tmp`;

  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  } catch {
    return next;
  }

  return next;
}
