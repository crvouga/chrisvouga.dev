/**
 * Bootstrap Vault `dev` and `prd` configs with derived defaults and report
 * any secrets that still need manual values.
 */
import { assert, hotAssert, type Assert } from '@pkgs/assert';

const ha: Assert = hotAssert();
import { VaultCli } from '@pkgs/vault';

import { VAULT_CONFIGS, VAULT_SECRET_REGISTRY } from './vault-secrets-registry';
import { readVaultYamlDefaults } from './vault-yaml-defaults';

function main(): void {
  assert.nonEmptyArray(VAULT_CONFIGS, 'vault configs must be non-empty');
  assert.nonEmptyArray(
    VAULT_SECRET_REGISTRY,
    'secret registry must be non-empty'
  );
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
    ha.nonEmptyString(config, 'vault config must be non-empty');
    console.log(`\n[ensure-vault-secrets] config=${config} project=${project}`);

    for (const def of VAULT_SECRET_REGISTRY) {
      ha.nonEmptyString(def.key, 'registry entry key must be non-empty');
      const seed = def.seed();
      if (seed !== undefined) {
        const current = cli.kvGetField(project, config, def.key);
        if (current === null || current.trim().length === 0) {
          cli.kvUpsertField(project, config, def.key, seed);
          console.log(`  set default ${def.key}=${seed}`);
        }
      }
    }

    for (const def of VAULT_SECRET_REGISTRY) {
      ha.nonEmptyString(def.key, 'registry entry key must be non-empty');
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
