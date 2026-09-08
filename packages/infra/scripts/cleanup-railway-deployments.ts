#!/usr/bin/env bun
/**
 * Remove FAILED / CRASHED deployments from Railway services.
 *
 * Usage:
 *   bun run scripts/cleanup-railway-deployments.ts
 *   bun run scripts/cleanup-railway-deployments.ts --apply
 *   bun run scripts/cleanup-railway-deployments.ts --id portfolio --id vault --apply
 *   bun run scripts/cleanup-railway-deployments.ts --apply --wait-on-rate-limit
 */
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import {
  ensureProject,
  isRailwayRateLimitError,
  listDeployments,
  removeDeployment,
  resolveEnvironment,
  waitForRailwayRateLimit,
  type RailwayProject,
} from "../lib/railway-api.js";
import { ensureRailwayToken } from "../lib/railway-token.js";
import {
  loadServicesConfig,
  railwayEnvironmentName,
  railwayProjectName,
} from "../lib/services.js";

const CLEANUP_STATUSES = new Set(["FAILED", "CRASHED"]);

type Args = {
  readonly ids: readonly string[];
  readonly apply: boolean;
  readonly waitOnRateLimit: boolean;
  readonly continueOnError: boolean;
};

type ServiceRef = {
  readonly id: string;
  readonly name: string;
};

function parseArgs(argv: readonly string[]): Args {
  assert.array(argv, "argv must be an array");
  const ids: string[] = [];
  let apply = false;
  let waitOnRateLimit =
    process.env["RAILWAY_WAIT_ON_RATE_LIMIT"] === "1" ||
    process.env["RAILWAY_WAIT_ON_RATE_LIMIT"]?.toLowerCase() === "true";
  let continueOnError = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--apply") apply = true;
    else if (arg === "--wait-on-rate-limit") waitOnRateLimit = true;
    else if (arg === "--continue-on-error") continueOnError = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/cleanup-railway-deployments.ts [--id <name> ...] [--apply] [--wait-on-rate-limit] [--continue-on-error]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  return {
    ids: ids.filter(Boolean),
    apply,
    waitOnRateLimit,
    continueOnError,
  };
}

async function withRateLimitRetry<T>(
  waitOnRateLimit: boolean,
  run: () => Promise<T>,
): Promise<T> {
  assert.ok(typeof waitOnRateLimit === "boolean", "waitOnRateLimit must be a boolean");
  for (;;) {
    try {
      return await run();
    } catch (err) {
      if (waitOnRateLimit && isRailwayRateLimitError(err)) {
        await waitForRailwayRateLimit(err);
        continue;
      }
      throw err;
    }
  }
}

function projectServices(project: RailwayProject): readonly ServiceRef[] {
  assert.record(project, "railway project must be a record");
  const services = (
    project.services.edges?.map((edge) => ({
      id: edge.node.id,
      name: edge.node.name,
    })) ?? []
  );
  assert.array(services, "project services must be an array");
  return services;
}

function filterServices(
  services: readonly ServiceRef[],
  ids: readonly string[],
): readonly ServiceRef[] {
  assert.array(services, "services must be an array");
  assert.array(ids, "ids must be an array");
  if (ids.length === 0) return services;
  const wanted = new Set(ids.map((id) => id.toLowerCase()));
  const matched = services.filter((service) => wanted.has(service.name.toLowerCase()));
  assert.array(matched, "matched services must be an array");
  const matchedNames = new Set(matched.map((s) => s.name.toLowerCase()));
  for (const id of ids) {
    ha.nonEmptyString(id, "service id filter must be non-empty");
    if (!matchedNames.has(id.toLowerCase())) {
      console.log(`  skip ${id} (not on Railway)`);
    }
  }
  return matched;
}

async function cleanupService(
  projectId: string,
  environmentId: string,
  service: ServiceRef,
  apply: boolean,
  waitOnRateLimit: boolean,
): Promise<{ found: number; removed: number }> {
  assert.nonEmptyString(projectId, "project id must be non-empty");
  assert.nonEmptyString(environmentId, "environment id must be non-empty");
  assert.record(service, "service ref must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  assert.nonEmptyString(service.name, "service name must be non-empty");
  assert.ok(typeof apply === "boolean", "apply must be a boolean");
  const deployments = await withRateLimitRetry(waitOnRateLimit, () =>
    listDeployments({
      projectId,
      serviceId: service.id,
      environmentId,
    }),
  );
  assert.array(deployments, "deployments must be an array");

  const failed = deployments.filter((d) =>
    CLEANUP_STATUSES.has(d.status.toUpperCase()),
  );

  if (failed.length === 0) {
    console.log(`  ${service.name}: no failed deployments`);
    return { found: 0, removed: 0 };
  }

  let removed = 0;
  for (const deployment of failed) {
    ha.nonEmptyString(deployment.id, "deployment id must be non-empty");
    ha.nonEmptyString(deployment.status, "deployment status must be non-empty");
    const label = `${service.name} ${deployment.id} ${deployment.status} ${deployment.createdAt}`;
    if (!apply) {
      console.log(`  [plan] remove ${label}`);
      continue;
    }
    await withRateLimitRetry(waitOnRateLimit, () => removeDeployment(deployment.id));
    console.log(`  removed ${label}`);
    removed += 1;
  }

  return { found: failed.length, removed: apply ? removed : 0 };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadServicesConfig();
  const mode = args.apply ? "APPLY" : "DRY-RUN";
  const scope = args.ids.length > 0 ? args.ids.join(",") : "all";

  console.log(`Cleanup Railway failed deployments (${mode}) services=${scope}`);

  await ensureRailwayToken();

  const project = await withRateLimitRetry(args.waitOnRateLimit, () =>
    ensureProject(railwayProjectName(config)),
  );
  const environment = resolveEnvironment(project, railwayEnvironmentName(config));
  assert.nonEmptyString(environment.id, "environment id must be non-empty");
  const services = filterServices(projectServices(project), args.ids);
  assert.array(services, "services must be an array");

  let servicesScanned = 0;
  let failedFound = 0;
  let removed = 0;
  const errors: string[] = [];

  for (const service of services) {
    ha.nonEmptyString(service.id, "service id must be non-empty");
    ha.nonEmptyString(service.name, "service name must be non-empty");
    try {
      const result = await cleanupService(
        project.id,
        environment.id,
        service,
        args.apply,
        args.waitOnRateLimit,
      );
      servicesScanned += 1;
      failedFound += result.found;
      removed += result.removed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const line = `${service.name}: ${msg}`;
      if (args.continueOnError) {
        console.error(`  error ${line}`);
        errors.push(line);
        continue;
      }
      throw err;
    }
  }

  console.log(
    `\nSummary: scanned=${servicesScanned} failed=${failedFound} ${
      args.apply ? `removed=${removed}` : `planned=${failedFound}`
    }`,
  );
  assert.nonNegative(servicesScanned, "services scanned must be non-negative");
  assert.nonNegative(failedFound, "failed found must be non-negative");
  assert.nonNegative(removed, "removed must be non-negative");

  if (errors.length > 0) {
    console.error(`\n${errors.length} service(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
