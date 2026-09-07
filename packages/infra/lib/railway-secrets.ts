import {
  findServiceByName,
  resolveProjectContext,
  upsertVariables,
} from "./railway-api.js";
import { vaultKvGetConfig, type VaultKvConfig } from "./vault-kv.js";
import {
  loadServicesConfig,
  railwayEnvironmentName,
  railwayProjectName,
  railwayServiceName,
  type SecretSpec,
  type ServiceSpec,
} from "./services.js";

const VAULT_ENV_ALIASES: Readonly<Record<string, readonly string[]>> = {};

/** Production Railway services read runtime secrets from Vault prd. */
const RAILWAY_VAULT_CONFIG: VaultKvConfig = "prd";

let cachedVaultSecrets: Record<string, string> | null | undefined;

export async function loadVaultSecretEnv(force = false): Promise<Record<string, string>> {
  if (!force && cachedVaultSecrets !== undefined) return cachedVaultSecrets ?? {};
  cachedVaultSecrets = null;

  try {
    const { vaultKvGetPrd } = await import("./vault-kv.js");
    cachedVaultSecrets = await vaultKvGetPrd();
    return cachedVaultSecrets;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Vault prd unavailable for Railway secrets (${msg}) — using process.env only`);
    cachedVaultSecrets = {};
  }
  return cachedVaultSecrets;
}

function resolveSecret(
  spec: SecretSpec,
  vaultData: Record<string, string>,
): string | null {
  if (spec.source === "literal") return spec.value;

  const fromEnv = process.env[spec.name]?.trim();
  if (fromEnv) return fromEnv;

  for (const alias of VAULT_ENV_ALIASES[spec.name] ?? []) {
    const aliasEnv = process.env[alias]?.trim();
    if (aliasEnv) return aliasEnv;
  }

  if (spec.source === "env") return null;

  if (spec.source === "vault") {
    const fromVault = vaultData[spec.name]?.trim();
    if (fromVault) return fromVault;
    for (const alias of VAULT_ENV_ALIASES[spec.name] ?? []) {
      const aliasVault = vaultData[alias]?.trim();
      if (aliasVault) return aliasVault;
    }
  }

  return null;
}

export function collectServiceVariables(
  service: ServiceSpec,
  vaultData: Record<string, string> = {},
): { readonly variables: Record<string, string>; readonly missing: readonly string[] } {
  const variables: Record<string, string> = { ...(service.env ?? {}) };
  // Railway injects PORT when unset; custom domains use services.yaml `port` as targetPort.
  if (service.port != null) {
    variables.PORT = String(service.port);
  }
  const missing: string[] = [];

  for (const spec of service.secrets ?? []) {
    const value = resolveSecret(spec, vaultData);
    if (value == null) {
      missing.push(spec.name);
      continue;
    }
    variables[spec.name] = value;
  }

  return { variables, missing };
}

export async function syncServiceVariablesToRailway(
  service: ServiceSpec,
  options?: {
    readonly skipDeploys?: boolean;
    readonly failOnMissing?: boolean;
    readonly vaultData?: Record<string, string>;
  },
): Promise<void> {
  const vaultData = options?.vaultData ?? (await loadVaultSecretEnv());
  const { variables, missing } = collectServiceVariables(service, vaultData);

  if (missing.length > 0) {
    const msg = `${service.id}: missing secrets: ${missing.join(", ")} (set in Vault prd or env)`;
    if (options?.failOnMissing !== false && (service.secrets?.length ?? 0) > 0) {
      throw new Error(msg);
    }
    console.warn(`  ${msg} — skipping secret sync`);
    if (Object.keys(variables).length === 0) return;
  }

  if (Object.keys(variables).length === 0) {
    console.log(`  ${service.id}: no variables to sync`);
    return;
  }

  const config = loadServicesConfig();
  const projectName = railwayProjectName(config);
  const environmentName = railwayEnvironmentName(config);
  const serviceName = railwayServiceName(config, service.id);

  const ctx = await resolveProjectContext(projectName, environmentName);
  const railwayService = findServiceByName(ctx.project, serviceName);
  if (!railwayService) {
    throw new Error(`Railway service "${serviceName}" not found — run provision-railway --apply first`);
  }

  await upsertVariables({
    projectId: ctx.projectId,
    environmentId: ctx.environmentId,
    serviceId: railwayService.id,
    variables,
    skipDeploys: options?.skipDeploys ?? true,
  });

  const secretKeys = (service.secrets ?? []).map((s) => s.name);
  const syncedSecrets = secretKeys.filter((k) => variables[k] != null);
  const syncedEnv = Object.keys(variables).filter((k) => !secretKeys.includes(k));
  const parts: string[] = [];
  if (syncedEnv.length > 0) parts.push(`env: ${syncedEnv.join(", ")}`);
  if (syncedSecrets.length > 0) parts.push(`secrets: ${syncedSecrets.join(", ")}`);
  console.log(`  ${service.id}: synced ${parts.join("; ")}`);
}
