/**
 * Post-deploy smoke test for the self-hosted Turborepo remote cache server.
 *
 * Requires TURBO_API and TURBO_TOKEN in env (via `vault run`).
 * CI: `bun run smoke:prd` after deploy.
 */
import { VaultSecretKey } from './vault-secrets-registry';
import { verifyB2S3Credentials } from './verify-b2-s3';

const READINESS_ATTEMPTS = 10;
const READINESS_DELAY_MS = 5_000;

type SmokeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

function fail(message: string): never {
  console.error('');
  console.error('════════════════════════════════════════════════════════');
  console.error('  Remote cache smoke test FAILED');
  console.error('════════════════════════════════════════════════════════');
  console.error(message);
  console.error('');
  process.exit(1);
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim() ?? '';
  if (value.length === 0) {
    fail(
      `${key} is required (use \`vault run -- bun run scripts/smoke-test-cache.ts\`).`
    );
  }
  return value;
}

function baseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/$/, '');
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function formatHttpError(
  method: string,
  url: string,
  res: Response
): Promise<string> {
  const status = String(res.status);
  let detail = '';
  try {
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === 'string' && body.error.length > 0) {
        detail = `: ${body.error}`;
      }
    } else {
      const text = (await res.text()).trim();
      if (text.length > 0) {
        detail = `: ${text.slice(0, 200)}`;
      }
    }
  } catch {
    // ignore parse errors
  }
  return `${method} ${url} returned HTTP ${status}${detail}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(apiUrl: string, token: string): Promise<void> {
  const url = `${baseUrl(apiUrl)}/v8/artifacts/status`;
  console.log(
    `Waiting for cache readiness (${String(READINESS_ATTEMPTS)} attempts)…`
  );

  for (let attempt = 1; attempt <= READINESS_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: authHeaders(token) });
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status === 'enabled') {
          console.log(
            `Cache ready (attempt ${String(attempt)}/${String(READINESS_ATTEMPTS)})`
          );
          return;
        }
        console.log(
          `attempt ${String(attempt)}/${String(READINESS_ATTEMPTS)}: unexpected body ${JSON.stringify(body)}`
        );
      } else {
        console.log(
          `attempt ${String(attempt)}/${String(READINESS_ATTEMPTS)}: HTTP ${String(res.status)}`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `attempt ${String(attempt)}/${String(READINESS_ATTEMPTS)}: ${msg}`
      );
    }

    if (attempt < READINESS_ATTEMPTS) {
      await sleep(READINESS_DELAY_MS);
    }
  }

  fail(
    `Cache not ready after ${String(READINESS_ATTEMPTS)} attempts (GET ${url})`
  );
}

function logCheck(name: string, result: SmokeResult): void {
  if (result.ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  console.error(`FAIL  ${name}: ${result.error}`);
}

async function checkHealth(apiUrl: string): Promise<SmokeResult> {
  const url = `${baseUrl(apiUrl)}/health`;
  try {
    const res = await fetch(url);
    if (res.status !== 200) {
      return {
        ok: false,
        error: `GET ${url} returned HTTP ${String(res.status)}`,
      };
    }
    const body = (await res.json()) as { status?: string };
    if (body.status !== 'ok') {
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

async function checkStatusUnauth(apiUrl: string): Promise<SmokeResult> {
  const url = `${baseUrl(apiUrl)}/v8/artifacts/status`;
  try {
    const res = await fetch(url);
    if (res.status !== 401) {
      return {
        ok: false,
        error: `GET ${url} without auth expected 401, got HTTP ${String(res.status)}`,
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `GET ${url} failed: ${msg}` };
  }
}

async function checkStatusAuth(
  apiUrl: string,
  token: string
): Promise<SmokeResult> {
  const url = `${baseUrl(apiUrl)}/v8/artifacts/status`;
  try {
    const res = await fetch(url, { headers: authHeaders(token) });
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

async function checkPutArtifact(
  apiUrl: string,
  token: string,
  hash: string,
  bytes: Uint8Array,
  tag: string
): Promise<SmokeResult> {
  const url = `${baseUrl(apiUrl)}/v8/artifacts/${hash}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        ...authHeaders(token),
        'x-artifact-tag': tag,
      },
      body: bytes.slice(),
    });
    if (res.status !== 200) {
      return {
        ok: false,
        error: await formatHttpError('PUT', url, res),
      };
    }
    const body = (await res.json()) as { urls?: unknown[] };
    if (!Array.isArray(body.urls) || body.urls.length !== 0) {
      return {
        ok: false,
        error: `PUT ${url} returned unexpected body: ${JSON.stringify(body)}`,
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `PUT ${url} failed: ${msg}` };
  }
}

async function checkHeadArtifact(
  apiUrl: string,
  token: string,
  hash: string
): Promise<SmokeResult> {
  const url = `${baseUrl(apiUrl)}/v8/artifacts/${hash}`;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: authHeaders(token),
    });
    if (res.status !== 200) {
      return {
        ok: false,
        error: await formatHttpError('HEAD', url, res),
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `HEAD ${url} failed: ${msg}` };
  }
}

async function checkGetArtifact(
  apiUrl: string,
  token: string,
  hash: string,
  expectedBytes: Uint8Array,
  expectedTag: string
): Promise<SmokeResult> {
  const url = `${baseUrl(apiUrl)}/v8/artifacts/${hash}`;
  try {
    const res = await fetch(url, { headers: authHeaders(token) });
    if (res.status !== 200) {
      return {
        ok: false,
        error: await formatHttpError('GET', url, res),
      };
    }
    const tag = res.headers.get('x-artifact-tag');
    if (tag !== expectedTag) {
      return {
        ok: false,
        error: `GET ${url} x-artifact-tag expected "${expectedTag}", got "${String(tag)}"`,
      };
    }
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.length !== expectedBytes.length) {
      return {
        ok: false,
        error: `GET ${url} body length ${String(body.length)} !== ${String(expectedBytes.length)}`,
      };
    }
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== expectedBytes[i]) {
        return {
          ok: false,
          error: `GET ${url} body byte mismatch at index ${String(i)}`,
        };
      }
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `GET ${url} failed: ${msg}` };
  }
}

async function checkExistenceMap(
  apiUrl: string,
  token: string,
  existingHash: string,
  missingHash: string
): Promise<SmokeResult> {
  const url = `${baseUrl(apiUrl)}/v8/artifacts`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([existingHash, missingHash]),
    });
    if (res.status !== 200) {
      return {
        ok: false,
        error: await formatHttpError('POST', url, res),
      };
    }
    const body = (await res.json()) as Record<string, boolean>;
    if (body[existingHash] !== true || body[missingHash] !== false) {
      return {
        ok: false,
        error: `POST ${url} returned unexpected body: ${JSON.stringify(body)}`,
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `POST ${url} failed: ${msg}` };
  }
}

async function runSuite(apiUrl: string, token: string): Promise<void> {
  const hash = `smoke-${String(Date.now())}-${crypto.randomUUID()}`;
  const missingHash = `smoke-missing-${crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const tag = 'team:smoke';

  const checks: Array<{ name: string; run: () => Promise<SmokeResult> }> = [
    { name: 'GET /health', run: () => checkHealth(apiUrl) },
    {
      name: 'GET /v8/artifacts/status (no auth -> 401)',
      run: () => checkStatusUnauth(apiUrl),
    },
    {
      name: 'GET /v8/artifacts/status (auth -> enabled)',
      run: () => checkStatusAuth(apiUrl, token),
    },
    {
      name: `PUT /v8/artifacts/${hash}`,
      run: () => checkPutArtifact(apiUrl, token, hash, bytes, tag),
    },
    {
      name: `HEAD /v8/artifacts/${hash}`,
      run: () => checkHeadArtifact(apiUrl, token, hash),
    },
    {
      name: `GET /v8/artifacts/${hash} (round-trip)`,
      run: () => checkGetArtifact(apiUrl, token, hash, bytes, tag),
    },
    {
      name: 'POST /v8/artifacts (existence map)',
      run: () => checkExistenceMap(apiUrl, token, hash, missingHash),
    },
  ];

  const failures: string[] = [];
  for (const check of checks) {
    const result = await check.run();
    logCheck(check.name, result);
    if (!result.ok) {
      failures.push(`${check.name}: ${result.error}`);
    }
  }

  if (failures.length > 0) {
    fail(
      `${String(failures.length)} check(s) failed:\n${failures.map((f) => `  • ${f}`).join('\n')}`
    );
  }
}

async function main(): Promise<void> {
  const apiUrl = requireEnv(VaultSecretKey.turboApi);
  const token = requireEnv(VaultSecretKey.turboToken);

  console.log(`Remote cache smoke test (${baseUrl(apiUrl)})`);

  const b2Err = await verifyB2S3Credentials();
  if (b2Err !== null) {
    fail(b2Err);
  }
  console.log('B2 S3 credentials OK');

  await waitForReady(apiUrl, token);
  await runSuite(apiUrl, token);

  console.log('');
  console.log('Remote cache smoke test OK');
}

await main();
