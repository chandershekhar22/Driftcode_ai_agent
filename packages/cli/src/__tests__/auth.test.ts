import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { authPath, clearAuth, readAuth, writeAuth } from "../lib/auth-store.ts";
import { createPkce } from "../lib/oauth.ts";

const dirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "drift-auth-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("PKCE", () => {
  test("the challenge is the SHA-256 of the verifier, base64url encoded", async () => {
    const { verifier, challenge } = await createPkce();

    // Recompute independently rather than trusting the implementation.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier),
    );

    const expected = Buffer.from(new Uint8Array(digest))
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");

    expect(challenge).toBe(expected);
  });

  test("the encoding is URL-safe and unpadded", async () => {
    const { verifier, challenge } = await createPkce();

    for (const value of [verifier, challenge]) {
      expect(value).not.toContain("+");
      expect(value).not.toContain("/");
      expect(value).not.toContain("=");
    }
  });

  test("every sign-in gets a fresh verifier", async () => {
    const seen = new Set<string>();

    for (let i = 0; i < 20; i++) {
      seen.add((await createPkce()).verifier);
    }

    expect(seen.size).toBe(20);
  });

  test("the verifier is long enough to be worth having", async () => {
    // RFC 7636 wants 43-128 characters.
    const { verifier } = await createPkce();

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });
});

describe("the stored session", () => {
  test("round-trips a token", async () => {
    const dir = await tempDir();

    await writeAuth({ token: "abc.def.ghi", email: "a@b.c", name: "A" }, dir);

    expect(await readAuth(dir)).toEqual({
      token: "abc.def.ghi",
      email: "a@b.c",
      name: "A",
    });
  });

  test("no file means not signed in, rather than an error", async () => {
    expect(await readAuth(await tempDir())).toBeNull();
  });

  test("a corrupt file means not signed in, rather than a crash", async () => {
    const dir = await tempDir();
    await writeFile(authPath(dir), "{ truncated", "utf8");

    expect(await readAuth(dir)).toBeNull();
  });

  test("a file without a token is not treated as a session", async () => {
    const dir = await tempDir();
    await writeFile(authPath(dir), JSON.stringify({ email: "a@b.c" }), "utf8");

    expect(await readAuth(dir)).toBeNull();
  });

  test("signing out removes the credential from disk", async () => {
    const dir = await tempDir();

    await writeAuth({ token: "abc" }, dir);
    await clearAuth(dir);

    expect(await readAuth(dir)).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  test("signing out when never signed in is not an error", async () => {
    await clearAuth(await tempDir());
  });

  test("leaves no temporary files behind", async () => {
    const dir = await tempDir();
    await writeAuth({ token: "abc" }, dir);

    expect(await readdir(dir)).toEqual(["auth.json"]);
  });
});
