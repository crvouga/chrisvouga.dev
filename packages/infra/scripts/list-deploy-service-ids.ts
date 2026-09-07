#!/usr/bin/env bun
/**
 * Print deployable service ids as JSON (for CI matrix).
 *
 * Usage:
 *   bun run scripts/list-deploy-service-ids.ts
 *   bun run scripts/list-deploy-service-ids.ts --id portfolio
 */
import {
  deployableServices,
  findService,
  loadServicesConfig,
} from "../lib/services.js";

function parseIds(argv: readonly string[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/list-deploy-service-ids.ts [--id <id> ...]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return ids.filter(Boolean);
}

const filterIds = parseIds(process.argv.slice(2));
const config = loadServicesConfig();

const services =
  filterIds.length === 0
    ? deployableServices(config)
    : filterIds.map((id) => {
        const service = findService(config, id);
        if (!service) {
          console.error(`No service with id "${id}"`);
          process.exit(1);
        }
        return service;
      });

console.log(JSON.stringify(services.map((s) => s.id)));
