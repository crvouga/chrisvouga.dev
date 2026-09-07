import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export type VaultConfig = {
  addr: string;
  mount: string;
  project: string;
  config: string;
};

export const DEFAULT_VAULT: VaultConfig = {
  addr: 'https://vault.chrisvouga.dev',
  mount: 'secret',
  project: 'personal',
  config: 'prd',
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

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function envVault(): VaultConfig {
  return {
    addr: process.env['VAULT_ADDR']?.trim() || DEFAULT_VAULT.addr,
    mount: process.env['VAULT_MOUNT']?.trim() || DEFAULT_VAULT.mount,
    project: process.env['VAULT_PROJECT']?.trim() || DEFAULT_VAULT.project,
    config: process.env['VAULT_CONFIG']?.trim() || DEFAULT_VAULT.config,
  };
}

/** `.vault.yaml` overrides (found upward), or null when absent/unparseable. */
function yamlVault(fromDir: string): Partial<VaultConfig> | null {
  const yamlPath = findUp(fromDir, '.vault.yaml');
  if (yamlPath === null) return null;
  try {
    const parsed = parseYaml(readFileSync(yamlPath, 'utf8')) as Record<
      string,
      unknown
    > | null;
    if (parsed === null || typeof parsed !== 'object') return null;
    return {
      ...(nonEmpty(parsed['addr']) ? { addr: parsed['addr'] } : {}),
      ...(nonEmpty(parsed['mount']) ? { mount: parsed['mount'] } : {}),
      ...(nonEmpty(parsed['project']) ? { project: parsed['project'] } : {}),
      ...(nonEmpty(parsed['config']) ? { config: parsed['config'] } : {}),
    };
  } catch {
    // Unparseable .vault.yaml — fall back to defaults/env.
    return null;
  }
}

/** Resolve Vault coordinates: env > `.vault.yaml` (found upward) > defaults. */
export function resolveVaultConfig(
  fromDir: string = import.meta.dir
): VaultConfig {
  return { ...envVault(), ...yamlVault(fromDir) };
}

export function kvPath(vault: VaultConfig): string {
  return `${vault.mount}/data/${vault.project}/${vault.config}`;
}
