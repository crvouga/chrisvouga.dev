#!/usr/bin/env bun
/**
 * Print platform env vars derived from services.yaml (for CI GITHUB_ENV).
 *
 * Usage:
 *   bun run scripts/print-platform-env.ts
 *   eval "$(bun run scripts/print-platform-env.ts --format shell)"
 */
import { assert } from "@pkgs/assert";
import {
  imagePrefix,
  infraGithubRepo,
  loadServicesConfig,
  railwayEnvironmentName,
  railwayProjectName,
  railwayRegion,
  railwayServicePrefix,
  vaultAddr,
  zoneSlug,
} from "../lib/services.js";

function parseArgs(argv: readonly string[]): { format: "shell" | "github" } {
  assert.array(argv, "argv must be an array");
  let format: "shell" | "github" = "shell";
  for (const arg of argv) {
    if (arg === "--format") {
      const next = argv[argv.indexOf(arg) + 1];
      if (next === "github" || next === "shell") format = next;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/print-platform-env.ts [--format shell|github]");
      process.exit(0);
    }
  }
  return { format };
}

function main(): void {
  const { format } = parseArgs(process.argv.slice(2));
  assert.enum(format, ["shell", "github"], "format must be shell or github");
  const config = loadServicesConfig();
  const slug = zoneSlug(config.zone);
  assert.nonEmptyString(slug, "zone slug must be non-empty");
  const vars: Record<string, string> = {
    ZONE: config.zone,
    ZONE_SLUG: slug,
    VAULT_ADDR: vaultAddr(config),
    IMAGE_PREFIX: imagePrefix(config),
    INFRA_GITHUB_REPO: infraGithubRepo(config),
    RAILWAY_PROJECT: railwayProjectName(config),
    RAILWAY_ENVIRONMENT: railwayEnvironmentName(config),
    RAILWAY_REGION: railwayRegion(config),
    RAILWAY_SERVICE_PREFIX: railwayServicePrefix(config),
    STACK_DESCRIPTION: `${config.zone} Railway stack`,
  };
  assert.record(vars, "platform env vars must be a record");
  assert.nonEmptyString(vars["ZONE"], "ZONE must be non-empty");
  assert.ok(vars["VAULT_ADDR"].startsWith("https://"), "VAULT_ADDR must be https");

  if (format === "github") {
    for (const [key, value] of Object.entries(vars)) {
      console.log(`${key}=${value}`);
    }
    return;
  }

  for (const [key, value] of Object.entries(vars)) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    console.log(`export ${key}="${escaped}"`);
  }
}

main();
