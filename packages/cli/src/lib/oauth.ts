/**
 * The browser half of signing in.
 *
 * PKCE, because the CLI is a public client: it ships to every machine that
 * runs it, so it cannot hold a secret. The verifier is generated here, never
 * leaves this process until the code is redeemed, and the redemption itself
 * happens on the server so the provider's client secret stays there.
 */

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export interface Pkce {
  verifier: string;
  challenge: string;
}

export async function createPkce(): Promise<Pkce> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** Opens a URL in the user's browser, best effort. */
export function openBrowser(url: string): void {
  const command =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];

  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // Not fatal - the caller prints the URL too, so sign-in still works by
    // copy and paste on a machine with no browser (or over SSH).
  }
}

export interface CallbackListener {
  port: number;
  /** Resolves with the authorization code, or rejects on timeout. */
  code: Promise<string>;
  close: () => void;
}

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Listens on an ephemeral port for the redirect carrying the code.
 *
 * Bound to 127.0.0.1 rather than every interface: this briefly accepts an
 * authorization code, and it has no business being reachable from the network.
 */
export function listenForCallback(): CallbackListener {
  let resolveCode: (code: string) => void = () => {};
  let rejectCode: (reason: Error) => void = () => {};

  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const url = new URL(request.url);
      const received = url.searchParams.get("code");

      if (!received) {
        return new Response("Missing code.", { status: 400 });
      }

      resolveCode(received);

      return new Response(
        "<!doctype html><meta charset=\"utf-8\"><title>Signed in</title><body style=\"font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem\"><h1 style=\"font-size:1.25rem\">Signed in</h1><p>You can close this tab and go back to the terminal.</p></body>",
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    },
  });

  const timer = setTimeout(() => {
    rejectCode(new Error("Timed out waiting for the browser to come back."));
  }, SIGN_IN_TIMEOUT_MS);

  // The provider has to be told exactly where to send the browser, so a
  // listener with no port is not something to paper over.
  if (server.port === undefined) {
    clearTimeout(timer);
    server.stop(true);
    throw new Error("Could not open a local port to receive the sign-in.");
  }

  return {
    port: server.port,
    code,
    close: () => {
      clearTimeout(timer);
      server.stop(true);
    },
  };
}
