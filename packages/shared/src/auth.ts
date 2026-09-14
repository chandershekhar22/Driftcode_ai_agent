import { z } from "zod";

/**
 * Sign-in contracts.
 *
 * Auth is optional: `configured: false` means the server is running
 * single-user and the CLI should not offer to sign in at all, rather than
 * showing a login that cannot work.
 */

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  /** False for the local single-user row. */
  authenticated: z.boolean(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const authStatusSchema = z.object({
  configured: z.boolean(),
  user: authUserSchema.nullable(),
});

export type AuthStatus = z.infer<typeof authStatusSchema>;

/** The CLI generates PKCE and asks the server where to send the browser. */
export const authStartRequestSchema = z.object({
  codeChallenge: z.string().min(20),
  /** Where the CLI is listening for the redirect. */
  port: z.number().int().positive(),
});

export const authStartSchema = z.object({
  authorizeUrl: z.string().url(),
  state: z.string(),
});

export const authExchangeRequestSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(20),
});

export const authTokenSchema = z.object({
  token: z.string(),
  user: authUserSchema,
});

export type AuthToken = z.infer<typeof authTokenSchema>;
