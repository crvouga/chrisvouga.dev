import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type VaultYamlDefaults = {
  readonly addr: string;
  readonly mount: string;
  readonly project: string;
  readonly config: string;
};

const VAULT_YAML = join(import.meta.dirname, '..', '.vault.yaml');

function parseYamlValue(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (match === null || match[1] === undefined) return undefined;
  const raw = match[1].trim();
  const commentIdx = raw.indexOf(' #');
  const value = commentIdx >= 0 ? raw.slice(0, commentIdx).trim() : raw;
  return value.length > 0 ? value : undefined;
}

export function readVaultYamlDefaults(): VaultYamlDefaults {
  let text: string;
  try {
    text = readFileSync(VAULT_YAML, 'utf8');
  } catch {
    throw new Error(`could not read ${VAULT_YAML}`);
  }

  const addr = parseYamlValue(text, 'addr');
  const mount = parseYamlValue(text, 'mount');
  const project = parseYamlValue(text, 'project');
  const config = parseYamlValue(text, 'config');
  if (
    addr === undefined ||
    mount === undefined ||
    project === undefined ||
    config === undefined
  ) {
    throw new Error(
      `could not parse addr/mount/project/config from ${VAULT_YAML}`
    );
  }
  return { addr, mount, project, config };
}

/** Env → repo `.vault.yaml`. */
export function resolveVaultScope(options: {
  envProject?: string | undefined;
  envConfig?: string | undefined;
}): Pick<VaultYamlDefaults, 'project' | 'config'> {
  const fromYaml = readVaultYamlDefaults();
  const project = options.envProject?.trim() || fromYaml.project;
  const config = options.envConfig?.trim() || fromYaml.config;
  return { project, config };
}
