import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

// The .env lives at the workspace root, not next to this file. fileURLToPath
// rather than url.pathname - the latter yields "/C:/..." on Windows.
config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

/**
 * Parsed once at boot. Anything missing fails the process immediately with a
 * readable list, rather than surfacing as a confusing runtime error on the
 * first request that happens to need it.
 *
 * Keys arrive chapter by chapter - they stay optional here until the chapter
 * that needs them makes them required.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Optional at boot: the server still serves sessions without them, and the
  // chat route reports which key is missing when a model actually needs one.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
