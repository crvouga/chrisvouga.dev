import { assert, hotAssert, type Assert } from '@pkgs/assert';

const ha: Assert = hotAssert();
import { VaultCli } from '@pkgs/vault';
import { renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readVaultYamlDefaults,
  resolveVaultScope,
} from './vault-yaml-defaults';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
assert.nonEmptyString(apiRoot, 'api root must be non-empty');
const outPath = join(apiRoot, '.env');
assert.nonEmptyString(outPath, 'env out path must be non-empty');
const tmpPath = `${outPath}.${process.pid}.tmp`;
assert.nonEmptyString(tmpPath, 'env tmp path must be non-empty');

function encodeEnvValue(value: string): string {
  assert.string(value, 'encodeEnvValue requires string');
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')}"`;
}

type VaultScope = {
  token: string;
  addr: string;
  project: string;
  config: string;
};

function resolveScope(): VaultScope {
  let yamlDefaults: ReturnType<typeof readVaultYamlDefaults>;
  try {
    yamlDefaults = readVaultYamlDefaults();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[setup-dev-vars] ${msg}\n`);
    process.exit(1);
  }

  const cli = new VaultCli({
    addr: yamlDefaults.addr,
    mount: yamlDefaults.mount,
  });
  let token: string;
  try {
    const resolved = cli.resolveToken();
    if (resolved.source === 'cli') {
      process.stdout.write(
        '[setup-dev-vars] VAULT_TOKEN not set in env; using `vault print token`.\n'
      );
    }
    token = resolved.token;
  } catch {
    process.stderr.write(
      '[setup-dev-vars] VAULT_TOKEN is required. Set it in env, or run `vault login`.\n'
    );
    process.exit(1);
  }

  let project: string;
  let config: string;
  try {
    ({ project, config } = resolveVaultScope({
      envProject: process.env['VAULT_PROJECT'],
      envConfig: process.env['VAULT_CONFIG'],
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[setup-dev-vars] ${msg}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `[setup-dev-vars] scope: addr=${yamlDefaults.addr} project=${project} config=${config}\n`
  );

  return {
    token,
    addr: yamlDefaults.addr,
    project,
    config,
  };
}

async function main(): Promise<void> {
  const { token, addr, project, config } = resolveScope();
  assert.nonEmptyString(token, 'setup requires token');
  assert.nonEmptyString(addr, 'setup requires addr');
  assert.nonEmptyString(project, 'setup requires project');
  assert.nonEmptyString(config, 'setup requires config');
  const lines: string[] = [
    `VAULT_TOKEN=${encodeEnvValue(token)}`,
    `VAULT_ADDR=${encodeEnvValue(addr)}`,
    `VAULT_PROJECT=${encodeEnvValue(project)}`,
    `VAULT_CONFIG=${encodeEnvValue(config)}`,
    'PORT="8787"',
  ];

  const body = `${lines.join('\n')}\n`;
  assert.nonEmptyString(body, 'env body must be non-empty');
  writeFileSync(tmpPath, body, { encoding: 'utf8' });
  renameSync(tmpPath, outPath);

  for (const line of lines) {
    ha.nonEmptyString(line, 'env line must be non-empty');
  }

  process.stdout.write(
    `[setup-dev-vars] wrote .env (${lines.map((l) => l.split('=')[0]).join(', ')})\n`
  );
}

await main();
