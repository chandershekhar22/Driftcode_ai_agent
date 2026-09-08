import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { healthSchema, resolveModel } from "@driftcode/shared";
import { version } from "../package.json" with { type: "json" };

import { App } from "./app.tsx";
import { ApiClientError, apiRequest, apiUrl } from "./lib/api-client.ts";
import { dim, red, violet, bold } from "./lib/colors.ts";
import { ThemeProvider } from "./providers/theme/index.tsx";
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
      description: `Connected to ${health.service} v${health.version} at ${apiUrl}.`,
    };
  } catch (error) {
    const message =
      error instanceof ApiClientError ? error.message : String(error);
    return { connection: "offline", description: message };
  }
}

async function main() {
  const model = resolveModel(process.env.DRIFT_MODEL);
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

  const renderer = await createCliRenderer({
    // We handle ctrl+c ourselves so the terminal is always restored cleanly.
    exitOnCtrlC: false,
    targetFps: 30,
  });

  createRoot(renderer).render(
    <ThemeProvider initial={process.env.DRIFT_THEME}>
      <App
        version={version}
        cwd={displayCwd(process.cwd())}
        model={model}
        connection={connection}
        serverDescription={description}
      />
    </ThemeProvider>,
  );
}

main();
