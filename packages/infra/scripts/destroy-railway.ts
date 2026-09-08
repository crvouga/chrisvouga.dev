#!/usr/bin/env bun
/**
 * Destroy Railway services by id.
 *
 * Usage:
 *   bun run scripts/destroy-railway.ts --id pgweb --id filestash
 *   bun run scripts/destroy-railway.ts --id pgweb --apply
 */
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
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
  assert.array(argv, "argv must be an array");
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
  assert.nonEmptyArray(resolved, "at least one --id is required");

  return { ids: resolved, apply };
}

async function destroyOne(id: string, apply: boolean): Promise<void> {
  assert.nonEmptyString(id, "service id must be non-empty");
  assert.ok(typeof apply === "boolean", "apply must be a boolean");
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
  assert.nonEmptyArray(args.ids, "at least one --id is required");
  console.log(`Destroy Railway services (${args.apply ? "APPLY" : "DRY-RUN"}) ids=${args.ids.join(",")}`);

  const token = await ensureRailwayToken();
  assert.nonEmptyString(token, "railway token must be non-empty after friendly check");

  for (const id of args.ids) {
    ha.nonEmptyString(id, "service id must be non-empty");
    await destroyOne(id, args.apply);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
