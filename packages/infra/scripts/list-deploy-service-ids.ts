#!/usr/bin/env bun
/**
 * Print deployable service ids as JSON (for CI matrix).
 *
 * Usage:
 *   bun run scripts/list-deploy-service-ids.ts
 *   bun run scripts/list-deploy-service-ids.ts --id portfolio
 */
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import {
  deployableServices,
  findService,
  loadServicesConfig,
} from "../lib/services.js";

function parseIds(argv: readonly string[]): string[] {
  assert.array(argv, "argv must be an array");
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
assert.array(filterIds, "filter ids must be an array");
const config = loadServicesConfig();

const services =
  filterIds.length === 0
    ? deployableServices(config)
    : filterIds.map((id) => {
        ha.nonEmptyString(id, "service id filter must be non-empty");
        const service = findService(config, id);
        if (!service) {
          console.error(`No service with id "${id}"`);
          process.exit(1);
        }
        assert.defined(service, `No service with id "${id}"`);
        return service;
      });
assert.array(services, "services must be an array");

const ids = services.map((s) => s.id);
assert.array(ids, "deploy service ids must be an array");
for (const id of ids) {
  ha.nonEmptyString(id, "deploy service id must be non-empty");
}
console.log(JSON.stringify(ids));
