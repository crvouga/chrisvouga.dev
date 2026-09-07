import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  return zone.replace(/\./g, "-");
}

export function imagePrefix(config: ServicesConfig): string {
  return config.image_prefix?.trim() || zoneSlug(config.zone);
}

export function vaultAddr(config: ServicesConfig): string {
  return `https://vault.${config.zone}`;
}

/** Hostname for vault; infra must not manage or prune its DNS during partial syncs. */
export function standaloneVaultHostname(config: ServicesConfig): string {
  return `vault.${config.zone}`;
}

export function railwayProjectName(config: ServicesConfig): string {
  const project = config.railway?.project?.trim();
  if (!project) throw new Error("services.yaml: railway.project is required");
  return project;
}

export function railwayEnvironmentName(config: ServicesConfig): string {
  return config.railway?.environment?.trim() || "production";
}

export function railwayRegion(config: ServicesConfig): string {
  return config.railway?.region?.trim() || "us-east4";
}

export function railwayServicePrefix(config: ServicesConfig): string {
  return config.railway?.service_prefix?.trim() ?? "";
}

export function railwayServiceName(config: ServicesConfig, id: string): string {
  const prefix = railwayServicePrefix(config);
  return prefix ? `${prefix}-${id}` : id;
}

/** Legacy Fly.io app names kept the `crvouga-` prefix after Railway dropped it. */
export function legacyFlyAppName(_config: ServicesConfig, id: string): string {
  return `crvouga-${id}`;
}

export function railwaySleep(service: ServiceSpec): boolean {
  return service.railway?.sleep !== false;
}

export function railwayIsPublic(service: ServiceSpec): boolean {
  if (service.internal) return false;
  return service.railway?.public !== false;
}

export function railwayVolume(service: ServiceSpec): RailwayVolumeConfig | undefined {
  return service.railway?.volume;
}

export function railwayStartCommand(service: ServiceSpec): string | undefined {
  const cmd = service.railway?.start_command?.trim();
  return cmd || undefined;
}

export function serviceHealthPath(service: ServiceSpec): string | undefined {
  if (!service.health_check) return undefined;
  return service.health_path ?? "/";
}

/**
 * Railway deploy healthcheck path, or `null` to clear an existing healthcheck.
 * Returns `undefined` when the path is incompatible and no explicit override exists.
 */
export function railwayHealthcheckSetting(
  service: ServiceSpec,
): string | null | undefined {
  if (service.railway?.health_check === false) return null;

  if (service.railway?.health_path != null) {
    const override = service.railway.health_path.trim();
    return override.length > 0 ? override : null;
  }

  return railwayHealthcheckPath(service);
}

/** @deprecated Prefer `railwayHealthcheckSetting` for provision/update. */
export function railwayHealthcheckPath(service: ServiceSpec): string | undefined {
  if (!service.health_check) return undefined;

  const raw = service.railway?.health_path ?? service.health_path ?? "/";
  const pathOnly = raw.split("?")[0]?.trim();
  if (!pathOnly?.startsWith("/")) return undefined;
  if (pathOnly.includes("-")) return undefined;
  return pathOnly || "/";
}

export function infraGithubRepo(config: ServicesConfig): string {
  const repo = config.infra_github_repo?.trim();
  if (!repo) throw new Error("services.yaml: infra_github_repo is required");
  return repo;
}

export function imagePackageName(config: ServicesConfig, id: string): string {
  return `${imagePrefix(config)}-${id}`;
}

export function isPublicService(service: ServiceSpec): boolean {
  return service.internal !== true;
}

export function imageRepo(config: ServicesConfig, id: string): string {
  return `ghcr.io/${config.image_owner}/${imagePackageName(config, id)}`;
}

/** True when the service pulls a non-GHCR image via `image:`. */
export function usesExternalImage(service: ServiceSpec): boolean {
  return Boolean(service.image?.trim());
}

export function imageRef(config: ServicesConfig, id: string, tag?: string): string {
  const service = findService(config, id);
  const external = service?.image?.trim();
  if (external) return external;
  const resolvedTag = tag?.trim() || config.default_image_tag;
  return `${imageRepo(config, id)}:${resolvedTag}`;
}

export function isAlwaysOn(service: ServiceSpec): boolean {
  return !railwaySleep(service);
}

export function loadServicesConfig(
  path = join(import.meta.dirname, "..", "services.yaml"),
): ServicesConfig {
  const raw = parseYaml(readFileSync(path, "utf8")) as ServicesConfig;
  if (!raw?.zone?.trim()) {
    throw new Error(`Invalid services config at ${path}: zone is required`);
  }
  if (!raw?.railway?.project?.trim() || !raw?.railway?.region?.trim()) {
    throw new Error(`Invalid services config at ${path}: railway.project and railway.region are required`);
  }
  if (!raw?.services?.length) {
    throw new Error(`Invalid services config at ${path}`);
  }
  for (const service of raw.services) {
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
  return config.services.find((s) => s.id === id);
}

export type DnsTarget = { readonly id: string; readonly hostname: string };

/** Public hostnames for Cloudflare DNS sync (fleet only — excludes standalone). */
export function allDnsTargets(config: ServicesConfig): readonly DnsTarget[] {
  const targets: DnsTarget[] = [];
  for (const service of config.services) {
    if (service.standalone) continue;
    if (!isPublicService(service) || !railwayIsPublic(service) || !service.hostname) {
      continue;
    }
    targets.push({ id: service.id, hostname: service.hostname });
  }
  return targets;
}

export function recordName(hostname: string, zone: string): string {
  return hostname === zone ? "@" : hostname.replace(`.${zone}`, "");
}

/** Canonical FQDN for comparing Cloudflare record names (relative vs absolute). */
export function normalizeDnsHostname(name: string, zone: string): string {
  const trimmed = name.replace(/\.$/, "").trim();
  if (!trimmed || trimmed === "@") return zone;
  if (trimmed === zone) return zone;
  if (trimmed.endsWith(`.${zone}`)) return trimmed;
  return `${trimmed}.${zone}`;
}

export function allVaultSecretNames(config: ServicesConfig): readonly string[] {
  const names = new Set<string>();
  for (const service of config.services) {
    for (const secret of service.secrets ?? []) {
      if (secret.source === "vault") names.add(secret.name);
    }
  }
  return [...names].sort();
}

/** Group deployable services by github_repo for rollout script. */
export function groupByGithubRepo(
  config: ServicesConfig,
): Map<string, ServiceSpec[]> {
  const skip = new Set(config.skip_rollout_repos ?? []);
  const map = new Map<string, ServiceSpec[]>();
  for (const service of config.services) {
    if (skip.has(service.github_repo)) continue;
    const list = map.get(service.github_repo) ?? [];
    list.push(service);
    map.set(service.github_repo, list);
  }
  return map;
}

export function deployableServices(config: ServicesConfig): readonly ServiceSpec[] {
  return config.services.filter((service) => !service.standalone);
}

export function fleetServices(config: ServicesConfig): readonly ServiceSpec[] {
  return deployableServices(config);
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
  return `${railwayServiceName(config, id)}.up.railway.app`;
}
/** @deprecated Use railwaySleep */
export function flyMinMachines(service: ServiceSpec): number {
  return railwaySleep(service) ? 0 : 1;
}
/** @deprecated Use railwayIsPublic */
export const flyIsPublic = railwayIsPublic;
