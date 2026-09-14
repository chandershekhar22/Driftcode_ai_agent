import { beforeAll, describe, expect, test } from "bun:test";
import type { User } from "@driftcode/database";

/**
 * Token signing and verification.
 *
 * The env module parses process.env once at import, so the secret has to be in
 * place before the module under test is loaded - hence the dynamic import.
 */

type AuthModule = typeof import("../lib/auth.ts");

let auth: AuthModule;

const USER = {
  id: "user_123",
  clerkId: "clerk_abc",
  email: "someone@example.com",
  name: "Someone",
  createdAt: new Date(),
} as User;

beforeAll(async () => {
  process.env.JWT_SECRET = "a-long-enough-test-secret-value-1234567890";
  process.env.CLERK_FRONTEND_API = "https://example.clerk.accounts.dev";
  process.env.CLERK_OAUTH_CLIENT_ID = "test-client";

  auth = await import("../lib/auth.ts");
});

describe("session tokens", () => {
  test("a token round-trips to the user it was issued for", async () => {
    const token = await auth.issueToken(USER);

    expect(await auth.readToken(token)).toBe("user_123");
  });

  test("a tampered token is rejected, not trusted", async () => {
    const token = await auth.issueToken(USER);

    // Flip a character in the payload segment.
    const [header, payload, signature] = token.split(".");
    const swapped = `${header}.${payload?.slice(0, -2)}XX.${signature}`;

    expect(await auth.readToken(swapped)).toBeNull();
  });

  test("nonsense is rejected rather than throwing", async () => {
    expect(await auth.readToken("not-a-token")).toBeNull();
    expect(await auth.readToken("")).toBeNull();
  });

  test("a token signed with another secret is rejected", async () => {
    const { SignJWT } = await import("jose");

    const foreign = await new SignJWT({ sub: "user_123" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("driftcode")
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode("a-completely-different-secret-value-xyz"));

    expect(await auth.readToken(foreign)).toBeNull();
  });

  test("an expired token is rejected", async () => {
    const { SignJWT } = await import("jose");

    const expired = await new SignJWT({ sub: "user_123" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("driftcode")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    expect(await auth.readToken(expired)).toBeNull();
  });
});

describe("the authorize URL", () => {
  test("carries PKCE and the registered redirect", () => {
    const url = new URL(
      auth.authorizeUrl({
        redirectUri: "http://localhost:4000/auth/callback",
        state: "state-123",
        codeChallenge: "challenge-abc",
      }),
    );

    expect(url.origin).toBe("https://example.clerk.accounts.dev");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/auth/callback",
    );
  });

  test("asks for the scopes the profile needs", () => {
    const url = new URL(
      auth.authorizeUrl({
        redirectUri: "http://localhost:4000/auth/callback",
        state: "s",
        codeChallenge: "c",
      }),
    );

    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("scope")).toContain("email");
  });
});
