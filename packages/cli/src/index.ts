import { PROTOCOL_VERSION, healthSchema, resolveModel } from "@driftcode/shared";
import { version } from "../package.json" with { type: "json" };

import { ApiClientError, apiRequest, apiUrl } from "./lib/api-client.ts";
import { bold, dim, green, red, violet, yellow } from "./lib/colors.ts";

function banner() {
  console.log();
  console.log(`  ${violet(bold("drift"))} ${dim(`v${version}`)}`);
  console.log(`  ${dim("a terminal coding agent")}`);
  console.log();
}

async function main() {
  banner();

  const model = resolveModel(process.env.DRIFT_MODEL);
  console.log(`  ${dim("model  ")} ${model.label} ${dim(`(${model.id})`)}`);
  console.log(`  ${dim("server ")} ${apiUrl}`);

  try {
    const health = await apiRequest("/health", healthSchema);

    console.log(`  ${dim("status ")} ${green("connected")}`);
    console.log(
      `  ${dim("        ")} ${dim(`${health.service} v${health.version}, up ${health.uptime}s`)}`,
    );

    if (health.protocol !== PROTOCOL_VERSION) {
      console.log();
      console.log(
        `  ${yellow("!")} Server speaks protocol v${health.protocol}, this client speaks v${PROTOCOL_VERSION}.`,
      );
    }
  } catch (error) {
    const message = error instanceof ApiClientError ? error.message : String(error);

    console.log(`  ${dim("status ")} ${red("offline")}`);
    console.log();
    console.log(`  ${red("x")} ${message}`);
    console.log();
    console.log(`  ${dim("Start it in another terminal with:")}`);
    console.log(`  ${dim("  bun run dev:server")}`);
    console.log();
    process.exit(1);
  }

  console.log();
  console.log(`  ${dim("The interactive UI arrives in the next chapter.")}`);
  console.log();
}

main();
