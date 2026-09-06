/**
 * Verifies required Vault secrets for the Turborepo remote cache repo.
 *
 * CI: GitHub OIDC → vault-action injects env vars before this script runs.
 * Local: `vault run -- bun run scripts/check-vault-secrets.ts`.
 */
import {
  VAULT_SECRET_REGISTRY,
  VaultSecretKey,
  validateOptionalSecretFormat,
} from './vault-secrets-registry';
import { verifyB2S3Credentials } from './verify-b2-s3';

function isCi(): boolean {
  return (
    process.env['GITHUB_ACTIONS'] === 'true' ||
    process.env['CI'] === 'true' ||
    process.env['TURBO_FORCE_REMOTE_CACHE_CHECK'] === '1'
  );
}

function fail(message: string): never {
  console.error('');
  console.error('════════════════════════════════════════════════════════');
  console.error('  Vault secrets check FAILED');
  console.error('════════════════════════════════════════════════════════');
  console.error(message);
  console.error('');
  console.error('Run `bun run setup` to apply derived defaults, then set');
  console.error(
    'remaining secrets via `vault kv patch secret/personal/<config> KEY=value`.'
  );
  console.error('Registry: scripts/vault-secrets-registry.ts');
  console.error('');
  process.exit(1);
}

function readEnvSecret(key: string): string {
  return process.env[key]?.trim() ?? '';
}

async function smokeCacheStatus(
  apiUrl: string,
  token: string
): Promise<string | null> {
  const url = `${apiUrl.replace(/\/$/, '')}/v8/artifacts/status`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return `GET ${url} returned HTTP ${String(res.status)}`;
    }
    const body = (await res.json()) as { status?: string };
    if (body.status !== 'enabled') {
      return `GET ${url} returned unexpected body: ${JSON.stringify(body)}`;
    }
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `GET ${url} failed: ${msg}`;
  }
}

async function main(): Promise<void> {
  const config = process.env['VAULT_CONFIG']?.trim() || 'dev';
  const project = process.env['VAULT_PROJECT']?.trim() || 'personal';

  console.log(`Vault secrets check (project=${project}, config=${config})`);

  const missingRequired: string[] = [];
  const optionalWarnings: string[] = [];

  for (const def of VAULT_SECRET_REGISTRY) {
    const raw = readEnvSecret(def.key);

    if (def.required) {
      if (raw.length === 0) {
        missingRequired.push(`  • ${def.key} — ${def.hint}`);
      } else if (def.key === VaultSecretKey.turboApi) {
        const err = validateOptionalSecretFormat(def.key, raw);
        if (err !== null) missingRequired.push(`  • ${err}`);
      }
      continue;
    }

    if (raw.length === 0) {
      optionalWarnings.push(`  • ${def.key} (optional, unset)`);
      continue;
    }

    const err = validateOptionalSecretFormat(def.key, raw);
    if (err !== null) {
      missingRequired.push(`  • ${err}`);
    }
  }

  if (missingRequired.length > 0) {
    fail(`Missing or invalid required secrets:\n${missingRequired.join('\n')}`);
  }

  for (const line of optionalWarnings) {
    console.log(`warn:${line}`);
  }

  const b2Err = await verifyB2S3Credentials();
  if (b2Err !== null) {
    fail(`B2 S3 credentials check failed:\n  • ${b2Err}`);
  }
  console.log('B2 S3 credentials OK');

  const turboApi = readEnvSecret(VaultSecretKey.turboApi);
  const turboToken = readEnvSecret(VaultSecretKey.turboToken);

  // Skip cache smoke test in CI - the server may not exist until after deployment.
  if (!isCi() && turboApi.length > 0 && turboToken.length > 0) {
    const smokeErr = await smokeCacheStatus(turboApi, turboToken);
    if (smokeErr !== null) {
      console.log(`warn: cache smoke test failed: ${smokeErr}`);
    } else {
      console.log('Cache smoke OK (/v8/artifacts/status)');
    }
  }

  console.log(`Vault secrets OK (config=${config})`);
}

await main();
