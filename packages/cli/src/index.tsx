import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { findModel, healthSchema, resolveModel } from "@driftcode/shared";
import { version } from "../package.json" with { type: "json" };

import { App } from "./app.tsx";
import { ApiClientError, apiRequest, apiUrl } from "./lib/api-client.ts";
import { HELP_TEXT, parseArgs } from "./lib/args.ts";
import { bold, dim, red, violet, yellow } from "./lib/colors.ts";
import { fetchAuthStatus, restoreSession } from "./lib/auth-api.ts";
import { UNMETERED, fetchBalance } from "./lib/billing-api.ts";
import { readConfig, writeConfig } from "./lib/config.ts";
import { fallbackCatalog, fetchCatalog } from "./lib/models-api.ts";
import type { ConnectionState } from "./components/status-bar.tsx";

/**
 * Shorten an absolute path for the header - the full path is rarely useful and
 * always too wide.
 */
function displayCwd(cwd: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  const normalised = cwd.replaceAll("\\", "/");

  if (home) {
    const normalisedHome = home.replaceAll("\\", "/");
    if (normalised.startsWith(normalisedHome)) {
      return `~${normalised.slice(normalisedHome.length)}`;
    }
  }

  return normalised;
}

/**
 * Probe the server before taking over the screen. Doing this first means a
 * connection problem is reported as plain, scrollable text rather than inside
 * a full-screen UI the user then has to quit out of to read.
 */
async function probeServer(): Promise<{
  connection: ConnectionState;
  description: string;
}> {
  try {
    const health = await apiRequest("/health", healthSchema);

    return {
      connection: "connected",
      description: health.database
        ? `Connected to ${health.service} v${health.version} at ${apiUrl}.`
        : `Connected to ${health.service}, but it has no database. Set DATABASE_URL and restart it.`,
    };
  } catch (error) {
    const message =
      error instanceof ApiClientError ? error.message : String(error);
    return { connection: "offline", description: message };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    console.log();
    return;
  }

  for (const flag of args.unknown) {
    console.log(`  ${yellow("!")} Ignoring unrecognised argument: ${flag}`);
  }

  const stored = await readConfig();

  // Precedence throughout: an explicit flag beats a saved preference, which
  // beats the built-in default.
  const modelId = args.model ?? stored.model;

  if (args.model && !findModel(args.model)) {
    console.log(
      `  ${yellow("!")} "${args.model}" is not a known model - using the default instead.`,
    );
  }

  const model = resolveModel(modelId);
  const theme = args.theme ?? stored.theme;

  // A flag is for one run, but naming a model is almost always meant to stick.
  if (args.model && findModel(args.model)) {
    await writeConfig({ model: args.model });
  }

  const { connection, description } = await probeServer();

  if (connection === "offline") {
    console.log();
    console.log(`  ${violet(bold("drift"))} ${dim(`v${version}`)}`);
    console.log();
    console.log(`  ${red("x")} ${description}`);
    console.log();
    console.log(`  ${dim("Starting anyway - the UI works, but the agent will not")}`);
    console.log(`  ${dim("respond until the server is up:")}`);
    console.log(`  ${dim("  bun run dev:server")}`);
    console.log();
  }

  // Any stored token has to be in place before the first request, including
  // the catalog fetch below - an authenticated server rejects the rest.
  await restoreSession();

  const authStatus =
    connection === "connected"
      ? await fetchAuthStatus().catch(() => ({
          configured: false,
          user: null,
        }))
      : { configured: false, user: null };

  if (authStatus.configured && !authStatus.user) {
    console.log(
      `  ${yellow("!")} Not signed in. Run /login once the UI is up.`,
    );
    console.log();
  }

  const balance =
    connection === "connected" ? await fetchBalance() : UNMETERED;

  // Ask the server what it can actually run, so the picker never offers a
  // model that would fail the moment a message is sent.
  const catalog =
    connection === "connected" ? await fetchCatalog() : fallbackCatalog();

  if (catalog.empty) {
    console.log(
      `  ${yellow("!")} The server has no model provider configured.`,
    );
    console.log(
      `  ${dim("  Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.")}`,
    );
    console.log();
  }

  // --resume only makes sense if we have somewhere to resume to; otherwise
  // fall through to the session list rather than erroring.
  const initialEntries =
    args.resume && stored.lastSessionId
      ? [`/session/${stored.lastSessionId}`]
      : undefined;

  if (args.resume && !stored.lastSessionId) {
    console.log(`  ${yellow("!")} No previous session to resume.`);
  }

  const renderer = await createCliRenderer({
    // We handle ctrl+c ourselves so the terminal is always restored cleanly.
    exitOnCtrlC: false,
    targetFps: 30,
  });

  createRoot(renderer).render(
    <App
      initialTheme={theme}
      initialEntries={initialEntries}
      initialConfig={stored}
      authStatus={authStatus}
      balance={balance}
      config={{
        version,
        cwd: process.cwd(),
        cwdLabel: displayCwd(process.cwd()),
        model,
        connection,
        serverDescription: description,
        catalog,
      }}
    />,
  );
}

main();
