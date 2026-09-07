#!/usr/bin/env bun
/**
 * Resolve secrets from Vault prd (or env) and upsert Railway variables.
 *
 * Usage:
 *   bun run scripts/sync-railway-secrets.ts
 *   bun run scripts/sync-railway-secrets.ts --id moviefinder-app-clojurescript
 *   vault run -- bun run sync-railway-secrets --id moviefinder-app-clojurescript
 */
import { syncServiceVariablesToRailway } from "../lib/railway-secrets.js";
import { ensureRailwayToken } from "../lib/railway-token.js";
import {
  deployableServices,
  findService,
  loadServicesConfig,
} from "../lib/services.js";

type Args = {
  readonly ids: readonly string[];
  readonly redeploy: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const ids: string[] = [];
  let redeploy = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--redeploy") redeploy = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/sync-railway-secrets.ts [--id <id> ...] [--redeploy]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { ids: ids.filter(Boolean), redeploy };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadServicesConfig();
  await ensureRailwayToken();

  const services =
    args.ids.length === 0
      ? deployableServices(config)
      : args.ids.map((id) => {
          const service = findService(config, id);
          if (!service) {
            console.error(`No service with id "${id}"`);
            process.exit(1);
          }
          return service;
        });

  console.log(`Sync Railway variables (${services.length} services)`);
  for (const service of services) {
    await syncServiceVariablesToRailway(service, {
      skipDeploys: !args.redeploy,
      failOnMissing: true,
    });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
