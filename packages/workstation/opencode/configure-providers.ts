#!/usr/bin/env bun
/**
 * Generate ~/.config/opencode/opencode.json with every OpenCode provider that
 * has a valid API key in the secret store (Vault / OpenBao).
 *
 * For each provider in the catalog (`provider-secrets.ts`) this reads the
 * Vault KV row, validates the value through its `SecretStoreEntry`, and writes
 * `provider.<id>.options.apiKey` inline. Providers whose key is missing or
 * invalid are skipped with the entry's documentation (how to obtain / debug),
 * so a missing key never aborts the whole run.
 *
 * Delivery: the generated config embeds the keys and is written with 0600
 * permissions into $HOME — it is never committed. Re-running is idempotent and
 * merges into any existing config (preserving your other settings).
 *
 * Usage:
 *   bun run packages/workstation/opencode/configure-providers.ts [--strict]
 *   bun run --filter @pkgs/workstation configure:opencode [--strict]
 *
 * Token resolution: VAULT_TOKEN env, else `vault print token` (the secret-store
 * wrapper). Without `--strict`, an unavailable Vault logs a warning and exits 0
 * so workstation:setup still succeeds.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { VaultSecretStore } from '@pkgs/secret-store';
import { VaultCli } from '@pkgs/vault';

import { OPENCODE_PROVIDER_CATALOG } from './provider-secrets';

const CONFIG_PATH = join(homedir(), '.config/opencode/opencode.json');
const DEFAULT_ADDR = 'https://vault.chrisvouga.dev';
const DEFAULT_MOUNT = 'secret';
const DEFAULT_PROJECT = 'personal';
const DEFAULT_CONFIG = 'prd';

type VaultConfig = {
  addr: string;
  mount: string;
  project: string;
  config: string;
};

function findUp(start: string, name: string): string | null {
  let dir = start;
  while (true) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readVaultConfig(
  addr: string,
  mount: string,
  project: string,
  config: string
): VaultConfig {
  const yamlPath = findUp(import.meta.dir, '.vault.yaml');
  if (yamlPath !== null) {
    try {
      const parsed = parseYaml(readFileSync(yamlPath, 'utf8')) as Record<
        string,
        unknown
      > | null;
      if (parsed && typeof parsed === 'object') {
        addr = typeof parsed.addr === 'string' ? parsed.addr : addr;
        mount = typeof parsed.mount === 'string' ? parsed.mount : mount;
        project = typeof parsed.project === 'string' ? parsed.project : project;
        config = typeof parsed.config === 'string' ? parsed.config : config;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `warn: could not parse ${yamlPath} (${msg}); using defaults/env`
      );
    }
  }
  return { addr, mount, project, config };
}

function resolveVaultConfig(): VaultConfig {
  return readVaultConfig(
    process.env['VAULT_ADDR']?.trim() || DEFAULT_ADDR,
    process.env['VAULT_MOUNT']?.trim() || DEFAULT_MOUNT,
    process.env['VAULT_PROJECT']?.trim() || DEFAULT_PROJECT,
    process.env['VAULT_CONFIG']?.trim() || DEFAULT_CONFIG
  );
}

type ConnectedProvider = {
  id: string;
  name: string;
  vaultKey: string;
  apiKey: string;
  npm?: string;
  baseURL?: string;
  models?: Readonly<Record<string, unknown>>;
};

async function readSecrets(
  store: VaultSecretStore,
  keys: readonly string[]
): Promise<Record<string, string | null>> {
  const row = await store.getOptionalMany(keys);
  const out: Record<string, string | null> = {};
  for (const key of keys) {
    const secret = row[key];
    out[key] = secret === null ? null : secret.readSecretValue();
  }
  return out;
}

function buildProviderSection(
  connected: readonly ConnectedProvider[]
): Record<string, unknown> {
  const provider: Record<string, unknown> = {};
  for (const p of connected) {
    const options: Record<string, unknown> = { apiKey: p.apiKey };
    if (p.baseURL !== undefined) options.baseURL = p.baseURL;
    const entry: Record<string, unknown> = { options };
    if (p.npm !== undefined) entry.npm = p.npm;
    if (p.npm !== undefined) entry.name = p.name;
    if (p.models !== undefined) entry.models = p.models;
    provider[p.id] = entry;
  }
  return provider;
}

function loadExistingConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_PATH)) return {};
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  if (raw.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Refusing to overwrite non-JSON config at ${CONFIG_PATH} (${msg}).\n` +
        `Move or fix it, then re-run.`
    );
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Refusing to overwrite non-object config at ${CONFIG_PATH}.`
    );
  }
  return parsed as Record<string, unknown>;
}

function writeConfig(config: Record<string, unknown>): void {
  const json = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(CONFIG_PATH, json, { mode: 0o600 });
  console.log(`Wrote ${CONFIG_PATH}`);
}

async function main(): Promise<void> {
  const strict = process.argv.includes('--strict');
  const vault = resolveVaultConfig();
  const keys = OPENCODE_PROVIDER_CATALOG.map((p) => p.vaultKey);

  let token: string;
  try {
    token = new VaultCli({ addr: vault.addr }).resolveToken().token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!strict) {
      console.warn(
        `warn: Vault unavailable — skipping provider config (${msg}).\n` +
          `  Run \`vault login -method=userpass username=crvouga\` or export VAULT_TOKEN, then re-run.\n` +
          `  Use --strict to make this a hard failure.`
      );
      return;
    }
    throw new Error(`Vault token resolution failed: ${msg}`);
  }

  console.log(
    `Reading providers from ${vault.mount}/data/${vault.project}/${vault.config} …`
  );

  const store = new VaultSecretStore({
    token,
    addr: vault.addr,
    mount: vault.mount,
    project: vault.project,
    config: vault.config,
  });

  const secrets = await readSecrets(store, keys);

  const connected: ConnectedProvider[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const cfg of OPENCODE_PROVIDER_CATALOG) {
    const raw = secrets[cfg.vaultKey];
    if (raw === null) {
      skipped.push({ id: cfg.provider, reason: `missing ${cfg.vaultKey}` });
      continue;
    }
    const transformed = cfg.entry.transform(raw);
    const error = cfg.entry.validate(transformed);
    if (error !== null) {
      skipped.push({
        id: cfg.provider,
        reason: `invalid ${cfg.vaultKey}\n${error}`,
      });
      continue;
    }
    connected.push({
      id: cfg.provider,
      name: cfg.name,
      vaultKey: cfg.vaultKey,
      apiKey: transformed,
      npm: cfg.npm,
      baseURL: cfg.baseURL,
      models: cfg.models,
    });
  }

  const existing = loadExistingConfig();
  const providerSection = buildProviderSection(connected);
  existing.provider = {
    ...(typeof existing.provider === 'object' &&
    existing.provider !== null &&
    !Array.isArray(existing.provider)
      ? existing.provider
      : {}),
    ...providerSection,
  };
  if (existing['$schema'] === undefined) {
    existing['$schema'] = 'https://opencode.ai/config.json';
  }
  writeConfig(existing);

  console.log(`\nConnected ${connected.length} provider(s):`);
  for (const p of connected) console.log(`  ✓ ${p.id} (${p.vaultKey})`);
  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length} provider(s):`);
    for (const s of skipped) {
      console.log(`  − ${s.id}: ${s.reason}`);
    }
    console.log(
      `\nAdd a missing key at ${vault.mount}/data/${vault.project}/${vault.config} in the Vault UI, then re-run.`
    );
  }
}

await main();
