#!/usr/bin/env bun
/**
 * Destroy all Fly.io apps matching crvouga-* from services.yaml.
 *
 * Usage:
 *   bun run scripts/destroy-fly.ts
 *   bun run scripts/destroy-fly.ts --apply
 */
import { $ } from "bun";
import {
  deployableServices,
  legacyFlyAppName,
  loadServicesConfig,
} from "../lib/services.js";
import { requireFlyApiToken } from "../lib/fly-token.js";

const ALWAYS_DESTROY_FLY_APPS = [
  // Removed/standalone services that may still exist as old Fly apps.
  "crvouga-filestash",
  "crvouga-pgweb",
  "crvouga-vault",
] as const;

type Args = {
  readonly apply: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/destroy-fly.ts [--apply]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { apply };
}

async function flyAppExists(app: string): Promise<boolean> {
  const result = await $`flyctl apps list --json`.env({ ...process.env }).quiet().nothrow();
  if (result.exitCode !== 0) return false;
  const apps = JSON.parse(result.stdout.toString()) as Array<{ Name?: string; name?: string }>;
  return apps.some((entry) => (entry.Name ?? entry.name) === app);
}

async function destroyApp(app: string, apply: boolean): Promise<void> {
  const exists = await flyAppExists(app);
  if (!exists) {
    console.log(`  skip ${app} (not found)`);
    return;
  }
  if (!apply) {
    console.log(`  [plan] destroy ${app}`);
    return;
  }
  const result = await $`flyctl apps destroy ${app} --yes`.env({ ...process.env }).nothrow();
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim() || result.stdout.toString().trim());
  }
  console.log(`  destroyed ${app}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadServicesConfig();
  const apps = [
    ...new Set([
      ...deployableServices(config).map((service) => legacyFlyAppName(config, service.id)),
      ...ALWAYS_DESTROY_FLY_APPS,
    ]),
  ];

  console.log(`Destroy Fly apps (${args.apply ? "APPLY" : "DRY-RUN"}) count=${apps.length}`);
  requireFlyApiToken();

  for (const app of apps) {
    await destroyApp(app, args.apply);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
