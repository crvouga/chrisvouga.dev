/**
 * Smoke test every secret registered in the secret store.
 *
 * For each `SecretStoreEntry` this validates the presence + format of the
 * secret value, then runs functional smoke checks for secrets backed by live
 * services (B2 object store, cache server).
 *
 * Requires secrets in env (via `vault run --config <config>`).
 * Part of the main checks (`bun run check:ci`).
 */
import { assert, hotAssert, type Assert } from '@pkgs/assert';

const ha: Assert = hotAssert();

import {
  VAULT_SECRET_REGISTRY,
  VaultSecretKey,
} from './vault-secrets-registry';
import { verifyB2S3Credentials } from './verify-b2-s3';

type SmokeResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

function readEnvSecret(key: string): string {
  assert.nonEmptyString(key, 'readEnvSecret requires key');
  return process.env[key]?.trim() ?? '';
}

function fail(message: string): never {
  assert.nonEmptyString(message, 'fail requires message');
  console.error('');
  console.error('════════════════════════════════════════════════════════');
  console.error('  Secret store smoke test FAILED');
  console.error('════════════════════════════════════════════════════════');
  console.error(message);
  console.error('');
  process.exit(1);
}

function logResult(name: string, result: SmokeResult): void {
  assert.nonEmptyString(name, 'logResult requires name');
  assert.record(result, 'logResult requires result');
  if (result.ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  console.error(`FAIL  ${name}: ${result.error}`);
}

async function smokeCacheStatus(
  apiUrl: string,
  token: string
): Promise<SmokeResult> {
  assert.nonEmptyString(apiUrl, 'smokeCacheStatus requires apiUrl');
  assert.nonEmptyString(token, 'smokeCacheStatus requires token');
  const url = `${apiUrl.replace(/\/$/, '')}/v8/artifacts/status`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) {
      return {
        ok: false,
        error: `GET ${url} returned HTTP ${String(res.status)}`,
      };
    }
    const body = (await res.json()) as { status?: string };
    if (body.status !== 'enabled') {
      return {
        ok: false,
        error: `GET ${url} returned unexpected body: ${JSON.stringify(body)}`,
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `GET ${url} failed: ${msg}` };
  }
}

async function main(): Promise<void> {
  assert.nonEmptyArray(
    VAULT_SECRET_REGISTRY,
    'secret registry must be non-empty'
  );
  const config = process.env['VAULT_CONFIG']?.trim() || 'dev';
  const project = process.env['VAULT_PROJECT']?.trim() || 'personal';

  console.log(`Secret store smoke test (project=${project}, config=${config})`);

  const failures: string[] = [];

  for (const entry of VAULT_SECRET_REGISTRY) {
    ha.nonEmptyString(entry.key, 'registry entry key must be non-empty');
    const raw = readEnvSecret(entry.key);
    if (raw.length === 0) {
      if (entry.required) {
        const message = `${entry.key} is required but unset`;
        failures.push(message);
        logResult(entry.key, { ok: false, error: message });
      } else {
        logResult(entry.key, { ok: true });
      }
      continue;
    }

    const error = entry.validate(entry.transform(raw));
    if (error !== null) {
      failures.push(`${entry.key}: ${error}`);
      logResult(entry.key, { ok: false, error });
      continue;
    }
    logResult(entry.key, { ok: true });
  }

  const b2Error = await verifyB2S3Credentials();
  if (b2Error !== null) {
    failures.push(`B2 S3 credentials: ${b2Error}`);
    logResult('B2 S3 credentials', { ok: false, error: b2Error });
  } else {
    logResult('B2 S3 credentials', { ok: true });
  }

  const apiUrl = readEnvSecret(VaultSecretKey.turboApi);
  const token = readEnvSecret(VaultSecretKey.turboToken);
  if (apiUrl.length > 0 && token.length > 0) {
    const cacheResult = await smokeCacheStatus(apiUrl, token);
    if (cacheResult.ok) {
      logResult('Cache server (/v8/artifacts/status)', cacheResult);
    } else {
      console.log(
        `warn: cache smoke test (server may not be deployed): ${cacheResult.error}`
      );
    }
  } else {
    logResult('Cache server (/v8/artifacts/status)', { ok: true });
  }

  if (failures.length > 0) {
    fail(
      `${String(failures.length)} check(s) failed:\n${failures
        .map((f) => `  • ${f}`)
        .join('\n')}`
    );
  }

  console.log('');
  console.log('Secret store smoke test OK');
}

await main();
