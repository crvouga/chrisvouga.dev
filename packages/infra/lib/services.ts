import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import { parse as parseYaml } from "yaml";

export type SecretSource =
  | { readonly source: "vault" }
  /** Bootstrap / CI only — resolved from process.env, not Vault KV. */
  | { readonly source: "env" }
  | { readonly source: "github" }
  | { readonly source: "literal"; readonly value: string };

export type SecretSpec = {
  readonly name: string;
} & SecretSource;

export type AliasSpec = {
  readonly zone: string;
  readonly hosts: readonly string[];
  readonly target: string;
};

export type RailwayVolumeConfig = {
  readonly name: string;
  readonly mount_path: string;
  readonly size_gb?: number;
};

export type RailwayServiceConfig = {
  /** Enable Railway serverless sleep when idle (default true). */
  readonly sleep?: boolean;
  /** Expose HTTP publicly (default true for public services). */
  readonly public?: boolean;
  /** Override deploy healthcheck path when `health_path` is not Railway-compatible. */
  readonly health_path?: string;
  /** When false, disable Railway deploy healthcheck (e.g. OpenBao is sealed until CI unseals). */
  readonly health_check?: boolean;
  /** Optional Railway start command override (replaces image CMD). */
  readonly start_command?: string;
  readonly volume?: RailwayVolumeConfig;
};

export type RailwayPlatformConfig = {
  readonly project: string;
  readonly environment: string;
  readonly region: string;
  readonly service_prefix?: string;
};

export type ServiceSpec = {
  readonly id: string;
  /** Public hostname; required unless `internal: true`. */
  readonly hostname?: string;
  /** No DNS or public URL — queue consumers, etc. */
  readonly internal?: boolean;
  /** Excluded from fleet deploy, DNS sync, and destroy-fly — managed by deploy-vault. */
  readonly standalone?: boolean;
  readonly railway?: RailwayServiceConfig;
  readonly github_repo: string;
  readonly source_code_url: string;
  readonly dockerfile: string;
  readonly build_context: string;
  /**
   * Full image ref override (e.g. `ghcr.io/example/app:latest`).
   * When set, skips GHCR naming and is used verbatim (ignores `--image-tag`).
   */
  readonly image?: string;
  /** Container listen port; required for public HTTP services. */
  readonly port?: number;
  readonly health_check: boolean;
  /** Health-check path (default `/`). */
  readonly health_path?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly secrets?: readonly SecretSpec[];
  readonly depends_on?: readonly string[];
};

export type ServicesConfig = {
  readonly zone: string;
  readonly image_owner: string;
  readonly default_image_tag: string;
  readonly infra_github_repo?: string;
  readonly image_prefix?: string;
  readonly skip_rollout_repos?: readonly string[];
  readonly railway: RailwayPlatformConfig;
  readonly aliases?: readonly AliasSpec[];
  readonly services: readonly ServiceSpec[];
};

export function zoneSlug(zone: string): string {
  assert.nonEmptyString(zone, "zone must be non-empty");
  const slug = zone.replace(/\./g, "-");
  assert.nonEmptyString(slug, "zone slug must be non-empty");
  return slug;
}

export function imagePrefix(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(config.zone, "zone must be non-empty");
  const prefix = config.image_prefix?.trim() || zoneSlug(config.zone);
  assert.nonEmptyString(prefix, "image prefix must be non-empty");
  return prefix;
}

export function vaultAddr(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(config.zone, "zone must be non-empty");
  const addr = `https://vault.${config.zone}`;
  assert.ok(addr.startsWith("https://"), "vault addr must be https", { addr });
  return addr;
}

/** Hostname for vault; infra must not manage or prune its DNS during partial syncs. */
export function standaloneVaultHostname(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(config.zone, "zone must be non-empty");
  const hostname = `vault.${config.zone}`;
  assert.ok(hostname.endsWith(config.zone), "vault hostname must end with zone", { hostname });
  return hostname;
}

export function railwayProjectName(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const project = config.railway?.project?.trim();
  if (!project) throw new Error("services.yaml: railway.project is required");
  assert.nonEmptyString(project, "services.yaml railway.project must be non-empty");
  return project;
}

export function railwayEnvironmentName(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const name = config.railway?.environment?.trim() || "production";
  assert.nonEmptyString(name, "railway environment name must be non-empty");
  return name;
}

export function railwayRegion(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const region = config.railway?.region?.trim() || "us-east4";
  assert.nonEmptyString(region, "railway region must be non-empty");
  return region;
}

export function railwayServicePrefix(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const prefix = config.railway?.service_prefix?.trim() ?? "";
  assert.string(prefix, "railway service prefix must be a string");
  return prefix;
}

export function railwayServiceName(config: ServicesConfig, id: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  const prefix = railwayServicePrefix(config);
  const name = prefix ? `${prefix}-${id}` : id;
  assert.nonEmptyString(name, "railway service name must be non-empty");
  return name;
}

/** Legacy Fly.io app names kept the `crvouga-` prefix after Railway dropped it. */
export function legacyFlyAppName(_config: ServicesConfig, id: string): string {
  assert.nonEmptyString(id, "service id must be non-empty");
  const name = `crvouga-${id}`;
  assert.ok(name.startsWith("crvouga-"), "legacy fly app name must keep crvouga- prefix", { name });
  return name;
}

export function railwaySleep(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return service.railway?.sleep !== false;
}

export function railwayIsPublic(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (service.internal) return false;
  return service.railway?.public !== false;
}

export function railwayVolume(service: ServiceSpec): RailwayVolumeConfig | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return service.railway?.volume;
}

export function railwayStartCommand(service: ServiceSpec): string | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  const cmd = service.railway?.start_command?.trim();
  const result = cmd || undefined;
  assert.ok(result === undefined || result.length > 0, "start command must be undefined or non-empty");
  return result;
}

export function serviceHealthPath(service: ServiceSpec): string | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (!service.health_check) return undefined;
  const path = service.health_path ?? "/";
  assert.nonEmptyString(path, "service health path must be non-empty");
  return path;
}

/**
 * Railway deploy healthcheck path, or `null` to clear an existing healthcheck.
 * Returns `undefined` when the path is incompatible and no explicit override exists.
 */
export function railwayHealthcheckSetting(
  service: ServiceSpec,
): string | null | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (service.railway?.health_check === false) return null;

  if (service.railway?.health_path != null) {
    const override = service.railway.health_path.trim();
    assert.string(override, "railway health path override must be a string");
    return override.length > 0 ? override : null;
  }

  return railwayHealthcheckPath(service);
}

/** @deprecated Prefer `railwayHealthcheckSetting` for provision/update. */
export function railwayHealthcheckPath(service: ServiceSpec): string | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (!service.health_check) return undefined;

  const raw = service.railway?.health_path ?? service.health_path ?? "/";
  const pathOnly = raw.split("?")[0]?.trim();
  if (!pathOnly?.startsWith("/")) return undefined;
  if (pathOnly.includes("-")) return undefined;
  const result = pathOnly || "/";
  assert.nonEmptyString(result, "railway healthcheck path must be non-empty");
  return result;
}

export function infraGithubRepo(config: ServicesConfig): string {
  assert.record(config, "services config must be a record");
  const repo = config.infra_github_repo?.trim();
  if (!repo) throw new Error("services.yaml: infra_github_repo is required");
  assert.nonEmptyString(repo, "services.yaml infra_github_repo must be non-empty");
  return repo;
}

export function imagePackageName(config: ServicesConfig, id: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  const name = `${imagePrefix(config)}-${id}`;
  assert.nonEmptyString(name, "image package name must be non-empty");
  return name;
}

export function isPublicService(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return service.internal !== true;
}

export function imageRepo(config: ServicesConfig, id: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  assert.nonEmptyString(config.image_owner, "image owner must be non-empty");
  const repo = `ghcr.io/${config.image_owner}/${imagePackageName(config, id)}`;
  assert.ok(repo.startsWith("ghcr.io/"), "image repo must be ghcr.io", { repo });
  return repo;
}

/** True when the service pulls a non-GHCR image via `image:`. */
export function usesExternalImage(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return Boolean(service.image?.trim());
}

export function imageRef(config: ServicesConfig, id: string, tag?: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  if (tag !== undefined) assert.string(tag, "image tag must be a string");
  const service = findService(config, id);
  const external = service?.image?.trim();
  if (external) return external;
  const resolvedTag = tag?.trim() || config.default_image_tag;
  assert.nonEmptyString(resolvedTag, "resolved image tag must be non-empty");
  const ref = `${imageRepo(config, id)}:${resolvedTag}`;
  assert.nonEmptyString(ref, "image ref must be non-empty");
  return ref;
}

export function isAlwaysOn(service: ServiceSpec): boolean {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  return !railwaySleep(service);
}

export function loadServicesConfig(
  path = join(import.meta.dirname, "..", "services.yaml"),
): ServicesConfig {
  assert.nonEmptyString(path, "services config path must be non-empty");
  const raw = parseYaml(readFileSync(path, "utf8")) as ServicesConfig;
  assert.record(raw, "services config must be a record");
  if (!raw?.zone?.trim()) {
    throw new Error(`Invalid services config at ${path}: zone is required`);
  }
  assert.nonEmptyString(raw.zone.trim(), "services config zone must be non-empty");
  if (!raw?.railway?.project?.trim() || !raw?.railway?.region?.trim()) {
    throw new Error(`Invalid services config at ${path}: railway.project and railway.region are required`);
  }
  if (!raw?.services?.length) {
    throw new Error(`Invalid services config at ${path}`);
  }
  assert.nonEmptyArray(raw.services, "services config services must be non-empty");
  for (const service of raw.services) {
    ha.record(service, "service spec must be a record");
    ha.nonEmptyString(service.id, "service id must be non-empty");
    if (!service.github_repo || !service.source_code_url) {
      throw new Error(`Service "${service.id}" missing github_repo or source_code_url`);
    }
    if (!service.dockerfile || service.build_context === undefined) {
      throw new Error(`Service "${service.id}" missing dockerfile or build_context`);
    }
    if (service.internal) {
      if (service.hostname) {
        throw new Error(`Service "${service.id}" is internal but has hostname`);
      }
    } else if (railwayIsPublic(service)) {
      if (!service.hostname) {
        throw new Error(`Service "${service.id}" missing hostname`);
      }
      if (service.port == null) {
        throw new Error(`Service "${service.id}" missing port`);
      }
    }
  }
  return raw;
}

export function findService(
  config: ServicesConfig,
  id: string,
): ServiceSpec | undefined {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  assert.array(config.services, "services must be an array");
  return config.services.find((s) => s.id === id);
}

export type DnsTarget = { readonly id: string; readonly hostname: string };

/** Public hostnames for Cloudflare DNS sync (fleet only — excludes standalone). */
export function allDnsTargets(config: ServicesConfig): readonly DnsTarget[] {
  assert.record(config, "services config must be a record");
  assert.array(config.services, "services must be an array");
  const targets: DnsTarget[] = [];
  for (const service of config.services) {
    ha.nonEmptyString(service.id, "service id must be non-empty");
    if (service.standalone) continue;
    if (!isPublicService(service) || !railwayIsPublic(service) || !service.hostname) {
      continue;
    }
    targets.push({ id: service.id, hostname: service.hostname });
  }
  assert.array(targets, "dns targets must be an array");
  return targets;
}

export function recordName(hostname: string, zone: string): string {
  assert.nonEmptyString(hostname, "hostname must be non-empty");
  assert.nonEmptyString(zone, "zone must be non-empty");
  const name = hostname === zone ? "@" : hostname.replace(`.${zone}`, "");
  assert.nonEmptyString(name, "record name must be non-empty");
  return name;
}

/** Canonical FQDN for comparing Cloudflare record names (relative vs absolute). */
export function normalizeDnsHostname(name: string, zone: string): string {
  assert.string(name, "dns hostname must be a string");
  assert.nonEmptyString(zone, "zone must be non-empty");
  const trimmed = name.replace(/\.$/, "").trim();
  if (!trimmed || trimmed === "@") return zone;
  if (trimmed === zone) return zone;
  if (trimmed.endsWith(`.${zone}`)) return trimmed;
  const fqdn = `${trimmed}.${zone}`;
  assert.nonEmptyString(fqdn, "normalized hostname must be non-empty");
  return fqdn;
}

export function allVaultSecretNames(config: ServicesConfig): readonly string[] {
  assert.record(config, "services config must be a record");
  assert.array(config.services, "services must be an array");
  const names = new Set<string>();
  for (const service of config.services) {
    ha.nonEmptyString(service.id, "service id must be non-empty");
    for (const secret of service.secrets ?? []) {
      ha.nonEmptyString(secret.name, "secret name must be non-empty");
      if (secret.source === "vault") names.add(secret.name);
    }
  }
  const sorted = [...names].sort();
  assert.array(sorted, "vault secret names must be an array");
  return sorted;
}

/** Group deployable services by github_repo for rollout script. */
export function groupByGithubRepo(
  config: ServicesConfig,
): Map<string, ServiceSpec[]> {
  assert.record(config, "services config must be a record");
  assert.array(config.services, "services must be an array");
  const skip = new Set(config.skip_rollout_repos ?? []);
  const map = new Map<string, ServiceSpec[]>();
  for (const service of config.services) {
    ha.nonEmptyString(service.github_repo, "service github_repo must be non-empty");
    if (skip.has(service.github_repo)) continue;
    const list = map.get(service.github_repo) ?? [];
    list.push(service);
    map.set(service.github_repo, list);
  }
  assert.instanceOf(map, Map, "grouped repos must be a Map");
  return map;
}

export function deployableServices(config: ServicesConfig): readonly ServiceSpec[] {
  assert.record(config, "services config must be a record");
  assert.array(config.services, "services must be an array");
  const services = config.services.filter((service) => !service.standalone);
  assert.array(services, "deployable services must be an array");
  return services;
}

export function fleetServices(config: ServicesConfig): readonly ServiceSpec[] {
  assert.record(config, "services config must be a record");
  const services = deployableServices(config);
  assert.array(services, "fleet services must be an array");
  return services;
}

/** @deprecated Use legacyFlyAppName for Fly teardown; railwayServiceName for Railway. */
export const flyAppName = legacyFlyAppName;
/** @deprecated Use railwayProjectName */
export const flyOrg = railwayProjectName;
/** @deprecated Use railwayRegion */
export const flyRegion = railwayRegion;
/** @deprecated Use railwayServicePrefix */
export const flyAppPrefix = railwayServicePrefix;
/** @deprecated */
export function flyAppHostname(config: ServicesConfig, id: string): string {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(id, "service id must be non-empty");
  const hostname = `${railwayServiceName(config, id)}.up.railway.app`;
  assert.nonEmptyString(hostname, "fly app hostname must be non-empty");
  return hostname;
}
/** @deprecated Use railwaySleep */
export function flyMinMachines(service: ServiceSpec): number {
  assert.record(service, "service spec must be a record");
  const min = railwaySleep(service) ? 0 : 1;
  assert.nonNegative(min, "min machines must be non-negative");
  return min;
}
/** @deprecated Use railwayIsPublic */
export const flyIsPublic = railwayIsPublic;
