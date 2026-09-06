/**
 * Bootstrap Vault `dev` and `prd` configs with derived defaults and report
 * any secrets that still need manual values.
 */
import { VaultCli } from '@pkgs/vault';

import { VAULT_CONFIGS, VAULT_SECRET_REGISTRY } from './vault-secrets-registry';
import { readVaultYamlDefaults } from './vault-yaml-defaults';

function main(): void {
  let project: string;
  let addr: string;
  let mount: string;
  try {
    const yaml = readVaultYamlDefaults();
    project = yaml.project;
    addr = yaml.addr;
    mount = yaml.mount;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ensure-vault-secrets: ${msg}`);
    process.exit(1);
  }

  const cli = new VaultCli({ addr, mount });
  const stillMissing: string[] = [];

  for (const config of VAULT_CONFIGS) {
    console.log(`\n[ensure-vault-secrets] config=${config} project=${project}`);

    for (const def of VAULT_SECRET_REGISTRY) {
      if (def.defaultValue !== undefined) {
        const current = cli.kvGetField(project, config, def.key);
        if (current === null || current.trim().length === 0) {
          cli.kvUpsertField(project, config, def.key, def.defaultValue);
          console.log(`  set default ${def.key}=${def.defaultValue}`);
        }
      }
    }

    for (const def of VAULT_SECRET_REGISTRY) {
      if (!def.required) continue;
      const current = cli.kvGetField(project, config, def.key);
      if (current === null || current.trim().length === 0) {
        stillMissing.push(`  • ${config}/${def.key} — ${def.hint}`);
      }
    }
  }

  if (stillMissing.length > 0) {
    console.error('\nStill missing required secrets (set manually):');
    for (const line of stillMissing) {
      console.error(line);
    }
    console.error(
      '\nExample: vault kv patch -mount=secret personal/dev TURBO_TOKEN=...'
    );
    process.exit(1);
  }

  console.log(
    '\n[ensure-vault-secrets] all required secrets present in dev + prd'
  );
}

main();
