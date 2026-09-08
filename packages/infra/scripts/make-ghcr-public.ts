#!/usr/bin/env bun
/**
 * Set all zone-prefixed container packages on ghcr.io to public visibility.
 * Requires GH_TOKEN or GITHUB_TOKEN with packages:write.
 *
 * Usage:
 *   bun run scripts/make-ghcr-public.ts
 *   bun run scripts/make-ghcr-public.ts --id vault --require
 */
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import { setGhcrPackagePublic } from "../lib/ghcr.js";
import {
  findService,
  imagePackageName,
  infraGithubRepo,
  isAlwaysOn,
  loadServicesConfig,
  usesExternalImage,
  type ServiceSpec,
} from "../lib/services.js";

/** Pre-migration package names still on GHCR. */
const LEGACY_PACKAGE_NAMES: Readonly<Record<string, readonly string[]>> = {};

function servicesToProcess(ids: readonly string[]): readonly ServiceSpec[] {
  assert.array(ids, "ids must be an array");
  const config = loadServicesConfig();
  if (ids.length === 0) return config.services;
  return ids.map((id) => {
    ha.nonEmptyString(id, "service id filter must be non-empty");
    const service = findService(config, id);
    if (!service) {
      console.error(`No service with id "${id}"`);
      process.exit(1);
    }
    assert.defined(service, `No service with id "${id}"`);
    return service;
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const requirePublic = process.argv.includes("--require");
  const ids: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--id") ids.push(process.argv[++i] ?? "");
  }

  const config = loadServicesConfig();
  const repoSlug = infraGithubRepo(config);
  assert.nonEmptyString(repoSlug, "infra github repo must be non-empty");
  const services = servicesToProcess(ids.filter(Boolean));
  assert.array(services, "services must be an array");
  console.log(`Make ghcr packages public (${dryRun ? "DRY-RUN" : "APPLY"}) services=${services.length}`);
  assert.nonNegative(services.length, "service count must be non-negative");

  for (const service of services) {
    ha.nonEmptyString(service.id, "service id must be non-empty");
    if (usesExternalImage(service)) {
      console.log(`  skip ${service.id}: external image ${service.image}`);
      continue;
    }

    const names = new Set<string>([
      imagePackageName(config, service.id),
      ...(LEGACY_PACKAGE_NAMES[service.id] ?? []),
    ]);
    assert.ok(names.size > 0, "ghcr package names must be non-empty");

    let ok = false;
    for (const packageName of names) {
      ha.nonEmptyString(packageName, "ghcr package name must be non-empty");
      if (await setGhcrPackagePublic(config.image_owner, packageName, dryRun, repoSlug)) {
        ok = true;
      }
    }

    if (!ok) {
      const msg = `${service.id}: no GHCR package visibility updated (needs GH_TOKEN with packages:write)`;
      if (requirePublic || isAlwaysOn(service)) {
        throw new Error(msg);
      }
      console.warn(`  WARN: ${msg}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
