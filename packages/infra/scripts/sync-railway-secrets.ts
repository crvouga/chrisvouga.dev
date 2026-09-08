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
import { assert, hotAssert, type Assert } from "@pkgs/assert";
import { ensureRailwayToken } from "../lib/railway-token.js";
import {
  deployableServices,
  findService,
  loadServicesConfig,
} from "../lib/services.js";

const ha: Assert = hotAssert();

type Args = {
  readonly ids: readonly string[];
  readonly redeploy: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  assert.ok(Array.isArray(argv), "sync-railway-secrets argv must be an array");
  const ids: string[] = [];
  let redeploy = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") {
      const next = argv[++i];
      assert.ok(
        next === undefined || typeof next === "string",
        "sync-railway-secrets --id value must be a string when present",
      );
      ids.push(next ?? "");
    } else if (arg === "--redeploy") redeploy = true;
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
  const result = { ids: ids.filter(Boolean), redeploy };
  for (const id of result.ids) {
    ha.nonEmptyString(id, "sync-railway-secrets service id must be non-empty");
  }
  assert.nonNegative(result.ids.length, "sync-railway-secrets id count must be non-negative");
  assert.ok(typeof result.redeploy === "boolean", "sync-railway-secrets redeploy must be a boolean");
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assert.defined(args, "sync-railway-secrets args must be defined");
  const config = loadServicesConfig();
  assert.defined(config, "sync-railway-secrets services config must be defined");
  await ensureRailwayToken();

  const services =
    args.ids.length === 0
      ? deployableServices(config)
      : args.ids.map((id) => {
          ha.nonEmptyString(id, "sync-railway-secrets service id must be non-empty");
          const service = findService(config, id);
          if (!service) {
            console.error(`No service with id "${id}"`);
            process.exit(1);
          }
          ha.defined(service, "sync-railway-secrets service must be defined after friendly check");
          return service;
        });
  assert.nonNegative(services.length, "sync-railway-secrets service count must be non-negative");

  console.log(`Sync Railway variables (${services.length} services)`);
  for (const service of services) {
    ha.nonEmptyString(service.id, "sync-railway-secrets service id must be non-empty");
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
