#!/usr/bin/env bun
/**
 * Destroy Railway services by id.
 *
 * Usage:
 *   bun run scripts/destroy-railway.ts --id pgweb --id filestash
 *   bun run scripts/destroy-railway.ts --id pgweb --apply
 */
import {
  deleteService,
  ensureProject,
  findServiceByName,
  resolveEnvironment,
} from "../lib/railway-api.js";
import { ensureRailwayToken } from "../lib/railway-token.js";
import {
  loadServicesConfig,
  railwayEnvironmentName,
  railwayProjectName,
  railwayServiceName,
} from "../lib/services.js";

type Args = {
  readonly ids: readonly string[];
  readonly apply: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const ids: string[] = [];
  let apply = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--apply") apply = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/destroy-railway.ts --id <id> ... [--apply]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  const resolved = ids.filter(Boolean);
  if (resolved.length === 0) {
    console.error("At least one --id is required");
    process.exit(2);
  }

  return { ids: resolved, apply };
}

async function destroyOne(id: string, apply: boolean): Promise<void> {
  const config = loadServicesConfig();
  const serviceName = railwayServiceName(config, id);
  const project = await ensureProject(railwayProjectName(config));
  resolveEnvironment(project, railwayEnvironmentName(config));
  const railwayService = findServiceByName(project, serviceName);

  if (!railwayService) {
    console.log(`  skip ${serviceName} (not on Railway)`);
    return;
  }

  if (!apply) {
    console.log(`  [plan] destroy ${serviceName} (${railwayService.id})`);
    return;
  }

  await deleteService(railwayService.id);
  console.log(`  destroyed ${serviceName}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Destroy Railway services (${args.apply ? "APPLY" : "DRY-RUN"}) ids=${args.ids.join(",")}`);

  await ensureRailwayToken();

  for (const id of args.ids) {
    await destroyOne(id, args.apply);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
