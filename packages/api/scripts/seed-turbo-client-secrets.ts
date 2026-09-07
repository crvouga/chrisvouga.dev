#!/usr/bin/env bun
/**
 * Read or push Turbo *client* secrets for monorepos that use this cache.
 *
 * Source of truth: this repo's Vault (`personal` project). Values are read
 * via `vault run` (env injection) or the Vault CLI (`--mirror-prd`).
 *
 * Usage:
 *   bun run seed:turbo-client
 *     Print shell exports + `vault kv patch` commands for another project.
 *
 *   bun run seed:turbo-client -- --target-project gamezilla --target-config dev
 *     Push TURBO_* client secrets into another Vault project/config.
 *
 *   bun run seed:turbo-client -- --target-project gamezilla --all-configs
 *     Push into dev and prd on the consumer project.
 *
 *   bun run seed:turbo-client:mirror-prd
 *     Copy client TURBO_* secrets from dev → prd in this repo's Vault project.
 */
import { VaultCli } from '@pkgs/vault';

import {
  TURBO_CLIENT_OPTIONAL_KEYS,
  TURBO_CLIENT_REQUIRED_KEYS,
  VAULT_CONFIGS,
  turboClientRegistryDefaults,
} from './vault-secrets-registry';
import { readVaultYamlDefaults } from './vault-yaml-defaults';

type CliOptions = {
  readonly mirrorPrd: boolean;
  readonly allConfigs: boolean;
  readonly targetProject: string | null;
  readonly targetConfig: string;
  readonly sourceConfig: string;
};

function fail(message: string): never {
  console.error(`seed-turbo-client-secrets: ${message}`);
  process.exit(1);
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  let mirrorPrd = false;
  let allConfigs = false;
  let targetProject: string | null = null;
  let targetConfig = 'dev';
  let sourceConfig =
    process.env['VAULT_CONFIG']?.trim() ||
    process.env['VAULT_ENVIRONMENT']?.trim() ||
    'dev';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--mirror-prd') {
      mirrorPrd = true;
      continue;
    }
    if (arg === '--all-configs') {
      allConfigs = true;
      continue;
    }
    if (arg === '--target-project') {
      const value = args[i + 1]?.trim();
      if (value === undefined || value.length === 0) {
        fail('--target-project requires a value');
      }
      targetProject = value;
      i++;
      continue;
    }
    if (arg === '--target-config') {
      const value = args[i + 1]?.trim();
      if (value === undefined || value.length === 0) {
        fail('--target-config requires a value');
      }
      targetConfig = value;
      i++;
      continue;
    }
    if (arg === '--source-config') {
      const value = args[i + 1]?.trim();
      if (value === undefined || value.length === 0) {
        fail('--source-config requires a value');
      }
      sourceConfig = value;
      i++;
      continue;
    }
    if (arg.startsWith('-')) {
      fail(`unknown flag ${arg}`);
    }
  }

  if (mirrorPrd && targetProject !== null) {
    fail('use either --mirror-prd or --target-project, not both');
  }

  return { mirrorPrd, allConfigs, targetProject, targetConfig, sourceConfig };
}

function readEnvSecret(key: string): string | null {
  const value = process.env[key]?.trim() ?? '';
  return value.length > 0 ? value : null;
}

function resolveClientSecretsFromEnv(): Record<string, string> {
  const defaults = turboClientRegistryDefaults();
  const secrets: Record<string, string> = {};

  for (const key of TURBO_CLIENT_REQUIRED_KEYS) {
    const fromEnv = readEnvSecret(key);
    const fallback = defaults[key];
    const value = fromEnv ?? fallback ?? null;
    if (value === null || value.length === 0) {
      fail(
        `${key} is missing in env. Run via \`bun run seed:turbo-client\` (vault run) or set it in Vault config ${process.env['VAULT_CONFIG'] ?? 'dev'}.`
      );
    }
    secrets[key] = value;
  }

  for (const key of TURBO_CLIENT_OPTIONAL_KEYS) {
    const fromEnv = readEnvSecret(key);
    if (fromEnv !== null) {
      secrets[key] = fromEnv;
    }
  }

  return secrets;
}

function resolveClientSecretsFromVault(
  cli: VaultCli,
  project: string,
  config: string
): Record<string, string> {
  const defaults = turboClientRegistryDefaults();
  const secrets: Record<string, string> = {};

  for (const key of TURBO_CLIENT_REQUIRED_KEYS) {
    const fromVault = cli.kvGetField(project, config, key);
    const fallback = defaults[key];
    const value = fromVault ?? fallback ?? null;
    if (value === null || value.length === 0) {
      fail(
        `${project}/${config} is missing ${key}. Set it in this cache repo's Vault first.`
      );
    }
    secrets[key] = value;
  }

  for (const key of TURBO_CLIENT_OPTIONAL_KEYS) {
    const fromVault = cli.kvGetField(project, config, key);
    if (fromVault !== null && fromVault.length > 0) {
      secrets[key] = fromVault;
    }
  }

  return secrets;
}

function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function printClientSecrets(
  secrets: Record<string, string>,
  sourceLabel: string,
  targetProject: string | null,
  targetConfig: string,
  mount: string
): void {
  console.log(`# Turbo remote cache client secrets (${sourceLabel})`);
  console.log(
    '# Self-hosted cache — set these in consumer monorepo Vault dev + prd.'
  );
  console.log('');

  console.log('# Shell (local turbo run):');
  for (const key of [
    ...TURBO_CLIENT_REQUIRED_KEYS,
    ...TURBO_CLIENT_OPTIONAL_KEYS,
  ]) {
    const value = secrets[key];
    if (value !== undefined) {
      console.log(`export ${key}=${shellEscape(value)}`);
    }
  }

  console.log('');
  console.log('# Vault (consumer monorepo — run from any directory):');
  const vaultProject = targetProject ?? '<consumer-vault-project>';
  for (const config of VAULT_CONFIGS) {
    console.log(`# config=${config}`);
    for (const key of [
      ...TURBO_CLIENT_REQUIRED_KEYS,
      ...TURBO_CLIENT_OPTIONAL_KEYS,
    ]) {
      const value = secrets[key];
      if (value !== undefined) {
        console.log(
          `vault kv patch -mount=${mount} ${vaultProject}/${config} ${key}=${shellEscape(value)}`
        );
      }
    }
    console.log('');
  }

  if (targetProject === null) {
    console.log(
      '# Push automatically:\n' +
        `bun run seed:turbo-client -- --target-project ${vaultProject} --target-config ${targetConfig}`
    );
  }

  console.log('');
  console.log('# Turbo CLI:');
  console.log('turbo run build --cache=remote:rw');
}

function pushClientSecrets(
  cli: VaultCli,
  secrets: Record<string, string>,
  targetProject: string,
  targetConfig: string
): void {
  for (const [key, value] of Object.entries(secrets)) {
    cli.kvUpsertField(targetProject, targetConfig, key, value);
    console.log(`set ${targetProject}/${targetConfig} ${key}`);
  }

  console.log(
    `Turbo client secrets seeded on Vault project=${targetProject} config=${targetConfig}`
  );
}

function mirrorDevToPrd(cli: VaultCli, project: string): void {
  const secrets = resolveClientSecretsFromVault(cli, project, 'dev');

  for (const key of [
    ...TURBO_CLIENT_REQUIRED_KEYS,
    ...TURBO_CLIENT_OPTIONAL_KEYS,
  ]) {
    const value = secrets[key];
    if (value === undefined) continue;
    cli.kvUpsertField(project, 'prd', key, value);
    console.log(`mirrored dev → prd ${key}`);
  }

  console.log(
    `Turbo client secrets mirrored dev → prd (project=${project}). Fly secrets unchanged.`
  );
}

function main(): void {
  const options = parseCliOptions();
  let project: string;
  let mount: string;
  let addr: string;
  try {
    const yaml = readVaultYamlDefaults();
    project = yaml.project;
    mount = yaml.mount;
    addr = yaml.addr;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(msg);
  }

  const cli = new VaultCli({ addr, mount });

  if (options.mirrorPrd) {
    mirrorDevToPrd(cli, project);
    return;
  }

  const sourceLabel = `${project}/${options.sourceConfig}`;
  const secrets = resolveClientSecretsFromEnv();

  if (options.targetProject !== null) {
    const configs = options.allConfigs
      ? [...VAULT_CONFIGS]
      : [options.targetConfig];
    for (const config of configs) {
      pushClientSecrets(cli, secrets, options.targetProject, config);
    }
    return;
  }

  printClientSecrets(secrets, sourceLabel, null, options.targetConfig, mount);
}

main();
