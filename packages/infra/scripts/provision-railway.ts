#!/usr/bin/env bun
/**
 * Idempotent Railway provisioning from services.yaml.
 *
 * Usage:
 *   bun run scripts/provision-railway.ts
 *   bun run scripts/provision-railway.ts --apply
 *   bun run scripts/provision-railway.ts --check
 *   bun run scripts/provision-railway.ts --id portfolio --apply
 */
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import {
  connectServiceImage,
  ensureCustomDomain,
  ensureProject,
  ensureServiceFromImage,
  ensureVolume,
  resolveEnvironment,
  resolveProjectContext,
  updateServiceInstance,
  type RailwayProject,
} from "../lib/railway-api.js";
import { ensureGhcrPackagePublic } from "../lib/ghcr.js";
import { ensureRailwayGhcrPullCredentials } from "../lib/railway-ghcr.js";
import {
  collectServiceVariables,
  loadVaultSecretEnv,
  syncServiceVariablesToRailway,
} from "../lib/railway-secrets.js";
import { ensureRailwayToken } from "../lib/railway-token.js";
import {
  deployableServices,
  findService,
  imageRef,
  loadServicesConfig,
  railwayEnvironmentName,
  railwayIsPublic,
  railwayProjectName,
  railwayRegion,
  railwayServiceName,
  railwaySleep,
  railwayVolume,
  railwayHealthcheckSetting,
  railwayStartCommand,
  serviceHealthPath,
  usesExternalImage,
  type ServiceSpec,
  type ServicesConfig,
} from "../lib/services.js";

type Args = {
  readonly ids: readonly string[];
  readonly apply: boolean;
  readonly check: boolean;
  readonly fleetOnly: boolean;
  readonly skipDomains: boolean;
  readonly skipVolumes: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  assert.array(argv, "argv must be an array");
  const ids: string[] = [];
  let apply = false;
  let check = false;
  let fleetOnly = false;
  let skipDomains = false;
  let skipVolumes = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--apply") apply = true;
    else if (arg === "--check") check = true;
    else if (arg === "--fleet-only") fleetOnly = true;
    else if (arg === "--skip-domains") skipDomains = true;
    else if (arg === "--skip-volumes") skipVolumes = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/provision-railway.ts [--id <id> ...] [--apply] [--check] [--fleet-only] [--skip-domains] [--skip-volumes]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  return { ids: ids.filter(Boolean), apply, check, fleetOnly, skipDomains, skipVolumes };
}

function servicesForArgs(config: ServicesConfig, args: Args): readonly ServiceSpec[] {
  assert.record(config, "services config must be a record");
  assert.record(args, "args must be a record");
  assert.array(args.ids, "ids must be an array");
  if (args.ids.length > 0) {
    return args.ids.map((id) => {
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
  if (args.fleetOnly || args.apply || !args.check) return deployableServices(config);
  return config.services;
}

function describeService(config: ServicesConfig, service: ServiceSpec): string {
  assert.record(config, "services config must be a record");
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  const name = railwayServiceName(config, service.id);
  const image = imageRef(config, service.id);
  const sleep = railwaySleep(service);
  const health = serviceHealthPath(service) ?? "(none)";
  const railwayHealth = railwayHealthcheckSetting(service);
  const railwayHealthNote =
    railwayHealth === undefined && service.health_check
      ? " railway-health=(skipped)"
      : railwayHealth === null
        ? " railway-health=(disabled)"
      : railwayHealth && railwayHealth !== health
        ? ` railway-health=${railwayHealth}`
        : "";
  return `${name} image=${image} sleep=${sleep} health=${health}${railwayHealthNote}`;
}

async function provisionService(
  config: ServicesConfig,
  project: RailwayProject,
  environmentId: string,
  service: ServiceSpec,
  args: Args,
): Promise<void> {
  assert.record(config, "services config must be a record");
  assert.record(project, "railway project must be a record");
  assert.nonEmptyString(project.id, "railway project id must be non-empty");
  assert.nonEmptyString(environmentId, "environment id must be non-empty");
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  assert.record(args, "args must be a record");
  const serviceName = railwayServiceName(config, service.id);
  const image = imageRef(config, service.id);

  console.log(`\n=== ${service.id} ===`);
  console.log(`  ${describeService(config, service)}`);

  if (args.check) return;

  if (!args.apply) {
    console.log("  [plan] ensure service, instance settings, env, domain, volume");
    return;
  }

  const failOnMissing = (service.secrets?.length ?? 0) > 0;
  const vaultData = await loadVaultSecretEnv();
  assert.record(vaultData, "vault data must be a record");
  const { variables, missing } = collectServiceVariables(service, vaultData);
  if (missing.length > 0 && failOnMissing) {
    throw new Error(
      `${service.id}: missing secrets: ${missing.join(", ")} (set in Vault prd or env)`,
    );
  }

  const { service: railwayService, created } = await ensureServiceFromImage({
    project,
    name: serviceName,
    image,
    variables,
  });
  assert.nonEmptyString(railwayService.id, "railway service id must be non-empty");
  assert.ok(typeof created === "boolean", "created must be a boolean");

  await syncServiceVariablesToRailway(service, {
    skipDeploys: true,
    failOnMissing,
    vaultData,
  });

  const railwayHealthPath = railwayHealthcheckSetting(service);
  await updateServiceInstance({
    serviceId: railwayService.id,
    environmentId,
    healthcheckPath: railwayHealthPath,
    sleepApplication: railwaySleep(service),
    region: railwayRegion(config),
    numReplicas: 1,
    startCommand: railwayStartCommand(service) ?? null,
  });

  if (!usesExternalImage(service)) {
    await ensureGhcrPackagePublic(config, service.id);

    await ensureRailwayGhcrPullCredentials({
      serviceId: railwayService.id,
      environmentId,
    });
  }

  if (created) {
    await connectServiceImage(railwayService.id, image);
  }

  const volume = railwayVolume(service);
  if (volume && !args.skipVolumes) {
    await ensureVolume({
      projectId: project.id,
      serviceId: railwayService.id,
      environmentId,
      mountPath: volume.mount_path,
      name: volume.name,
      region: railwayRegion(config),
    });
    console.log(`  volume ${volume.name} → ${volume.mount_path}`);
  }

  if (!args.skipDomains && railwayIsPublic(service) && service.hostname) {
    await ensureCustomDomain({
      projectId: project.id,
      environmentId,
      serviceId: railwayService.id,
      domain: service.hostname,
      targetPort: service.port,
    });
    console.log(`  domain ${service.hostname}`);
  }

  console.log(`  ✓ provisioned ${serviceName}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadServicesConfig();
  const services = servicesForArgs(config, args);
  assert.array(services, "services must be an array");
  const projectName = railwayProjectName(config);
  const environmentName = railwayEnvironmentName(config);

  console.log(
    `Provision Railway (${args.check ? "CHECK" : args.apply ? "APPLY" : "DRY-RUN"}) project=${projectName} env=${environmentName} services=${services.length}`,
  );

  if (args.check) {
    for (const service of services) {
      console.log(`  OK ${service.id}: ${describeService(config, service)}`);
    }
    return;
  }

  await ensureRailwayToken();
  const ctx = await resolveProjectContext(projectName, environmentName);
  assert.nonEmptyString(ctx.projectId, "project id must be non-empty");
  assert.nonEmptyString(ctx.environmentId, "environment id must be non-empty");
  const project = args.apply ? await ensureProject(projectName) : ctx.project;
  const environment = resolveEnvironment(project, environmentName);
  assert.nonEmptyString(environment.id, "environment id must be non-empty");

  for (const service of services) {
    ha.nonEmptyString(service.id, "service id must be non-empty");
    await provisionService(config, project, environment.id, service, args);
  }

  console.log("\nProvision complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
