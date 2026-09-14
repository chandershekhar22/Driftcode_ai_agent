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

  // Auth is optional. Without these the server runs single-user; with them,
  // people sign in and each has their own sessions.
  // The externally reachable URL of this server. It is what gets registered
  // with the identity provider as a redirect URI, so it has to match exactly.
  PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  CLERK_FRONTEND_API: z.string().url().optional(),
  CLERK_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  CLERK_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET should be a long random string.").optional(),

  // Billing is optional too. Unconfigured, nothing is metered and use is
  // unlimited - the right default for a server you run yourself.
  POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
  POLAR_CREDITS_METER_ID: z.string().min(1).optional(),
  POLAR_PRODUCT_ID: z.string().min(1).optional(),
  POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
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
