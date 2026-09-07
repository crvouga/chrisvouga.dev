import { VaultSecretStore } from '@pkgs/secret-store';
import { VaultCli } from '@pkgs/vault';

import {
  OPENCODE_PROVIDER_CATALOG,
  type OpenCodeProviderConfig,
} from '../../opencode/provider-secrets';
import {
  ensureAutoRouterDefaults,
  ensureSchema,
  loadConfig,
  writeConfig,
} from './opencode-config';
import type { Platform } from './platform/types';
import { resolveVaultConfig, type VaultConfig } from './vault-config';

export type ProviderSyncResult = {
  connected: Array<{ id: string; vaultKey: string }>;
  skipped: Array<{ id: string; reason: string }>;
  configPath: string;
  model: string | null;
  smallModel: string | null;
};

export type ProviderStatus = {
  id: string;
  name: string;
  vaultKey: string;
  state: 'connected' | 'missing' | 'invalid' | 'unavailable';
  detail: string;
};

type SyncOpts = {
  strict?: boolean | undefined;
  vault?: VaultConfig | undefined;
};

type SecretRow = Record<string, string | null>;

function catalogKeys(): string[] {
  return OPENCODE_PROVIDER_CATALOG.map((p) => p.vaultKey);
}

/** Resolve a Vault token, or null when unavailable (non-strict mode). */
function resolveToken(vault: VaultConfig, strict: boolean): string | null {
  try {
    return new VaultCli({ addr: vault.addr }).resolveToken().token;
  } catch (err) {
    if (strict) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Vault token resolution failed: ${msg}`);
    }
    return null;
  }
}

function unavailableResult(keys: readonly string[]): ProviderSyncResult {
  return {
    connected: [],
    skipped: keys.map((k) => ({
      id: k,
      reason: 'vault unavailable — provider config skipped',
    })),
    configPath: '',
    model: null,
    smallModel: null,
  };
}

async function readSecretRow(
  vault: VaultConfig,
  token: string,
  keys: readonly string[]
): Promise<SecretRow> {
  const store = new VaultSecretStore({
    token,
    addr: vault.addr,
    mount: vault.mount,
    project: vault.project,
    config: vault.config,
  });
  const row = await store.getOptionalMany(keys);
  const out: SecretRow = {};
  for (const key of keys) {
    const secret = row[key] ?? null;
    out[key] = secret === null ? null : secret.readSecretValue();
  }
  return out;
}

function validateKey(
  cfg: OpenCodeProviderConfig,
  raw: string | null
): { apiKey: string } | { reason: string } {
  if (raw === null) {
    return { reason: `optional — ${cfg.vaultKey} not set` };
  }
  const transformed = cfg.entry.transform(raw);
  const error = cfg.entry.validate(transformed);
  if (error !== null) {
    return { reason: `invalid ${cfg.vaultKey}\n${error}` };
  }
  return { apiKey: transformed };
}

function providerConfigEntry(
  cfg: OpenCodeProviderConfig,
  apiKey: string
): Record<string, unknown> {
  const options: Record<string, unknown> = { apiKey };
  if (cfg.baseURL !== undefined) options['baseURL'] = cfg.baseURL;
  const entry: Record<string, unknown> = { options };
  if (cfg.npm !== undefined) entry['npm'] = cfg.npm;
  if (cfg.npm !== undefined) entry['name'] = cfg.name;
  if (cfg.models !== undefined) entry['models'] = cfg.models;
  return entry;
}

function mergeProviders(secrets: SecretRow): Pick<
  ProviderSyncResult,
  'connected' | 'skipped'
> & {
  section: Record<string, unknown>;
} {
  const connected: ProviderSyncResult['connected'] = [];
  const skipped: ProviderSyncResult['skipped'] = [];
  const section: Record<string, unknown> = {};
  for (const cfg of OPENCODE_PROVIDER_CATALOG) {
    const validated = validateKey(cfg, secrets[cfg.vaultKey] ?? null);
    if ('reason' in validated) {
      skipped.push({ id: cfg.provider, reason: validated.reason });
      continue;
    }
    connected.push({ id: cfg.provider, vaultKey: cfg.vaultKey });
    section[cfg.provider] = providerConfigEntry(cfg, validated.apiKey);
  }
  return { connected, skipped, section };
}

function priorSection(
  existing: Record<string, unknown>
): Record<string, unknown> {
  const prior = existing['provider'];
  return prior !== null && typeof prior === 'object' && !Array.isArray(prior)
    ? (prior as Record<string, unknown>)
    : {};
}

function withAutoRouter(
  existing: Record<string, unknown>,
  connected: ProviderSyncResult['connected']
): Record<string, unknown> {
  if (!connected.some((p) => p.id === 'openrouter')) return existing;
  return ensureAutoRouterDefaults(existing);
}

/** Merge the synced section into opencode.json and write it (0600). */
function writeProviderConfig(
  platform: Platform,
  section: Record<string, unknown>,
  connected: ProviderSyncResult['connected']
): Pick<ProviderSyncResult, 'configPath' | 'model' | 'smallModel'> {
  const existing = loadConfig(platform);
  existing['provider'] = { ...priorSection(existing), ...section };
  const next = ensureSchema(withAutoRouter(existing, connected));
  const configPath = writeConfig(platform, next);
  const model = typeof next['model'] === 'string' ? next['model'] : null;
  const smallModel =
    typeof next['small_model'] === 'string' ? next['small_model'] : null;
  return { configPath, model, smallModel };
}

/** Read provider keys from Vault and merge them into opencode.json. */
export async function syncProvidersFromVault(
  platform: Platform,
  opts?: SyncOpts
): Promise<ProviderSyncResult> {
  const strict = opts?.strict ?? false;
  const vault = opts?.vault ?? resolveVaultConfig();
  const keys = catalogKeys();

  const token = resolveToken(vault, strict);
  if (token === null) return unavailableResult(keys);
  const secrets = await readSecretRow(vault, token, keys);
  const { connected, skipped, section } = mergeProviders(secrets);
  return {
    connected,
    skipped,
    ...writeProviderConfig(platform, section, connected),
  };
}

function statusFor(
  cfg: OpenCodeProviderConfig,
  raw: string | null
): ProviderStatus {
  const base = { id: cfg.provider, name: cfg.name, vaultKey: cfg.vaultKey };
  const validated = validateKey(cfg, raw);
  if ('reason' in validated) {
    const missing = raw === null;
    return {
      ...base,
      state: missing ? 'missing' : 'invalid',
      detail: validated.reason,
    };
  }
  return { ...base, state: 'connected', detail: cfg.vaultKey };
}

/** Vault-backed status for every catalogued provider (no writes). */
export async function providerStatuses(
  vault?: VaultConfig
): Promise<ProviderStatus[]> {
  const resolved = vault ?? resolveVaultConfig();
  const keys = catalogKeys();
  const token = resolveToken(resolved, false);
  if (token === null) {
    return OPENCODE_PROVIDER_CATALOG.map((p) => ({
      id: p.provider,
      name: p.name,
      vaultKey: p.vaultKey,
      state: 'unavailable' as const,
      detail: 'vault token unavailable',
    }));
  }
  const secrets = await readSecretRow(resolved, token, keys);
  return OPENCODE_PROVIDER_CATALOG.map((p) =>
    statusFor(p, secrets[p.vaultKey] ?? null)
  );
}
