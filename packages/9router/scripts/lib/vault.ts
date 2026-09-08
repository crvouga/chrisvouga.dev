import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "@pkgs/assert";
import { ENV_FILE, REPO_ROOT, SECRET_KEYS, type SecretKey } from "./paths.ts";
import { requireCmd, run } from "./spawn.ts";

export type VaultKvConfig = "dev" | "prd";

/** Preferred Vault KV field → upstream 9router env var. */
export const VAULT_TO_APP_SECRET_MAP: Readonly<
  Record<SecretKey, readonly string[]>
> = {
  INITIAL_PASSWORD: ["9ROUTER_PASSWORD", "INITIAL_PASSWORD"],
  JWT_SECRET: ["9ROUTER_JWT_SECRET", "JWT_SECRET"],
  API_KEY_SECRET: ["9ROUTER_API_KEY_SECRET", "API_KEY_SECRET"],
  MACHINE_ID_SALT: ["9ROUTER_MACHINE_ID_SALT", "MACHINE_ID_SALT"],
};

export function defaultVaultKvConfig(): VaultKvConfig {
  const raw = process.env.VAULT_KV_CONFIG?.trim() || "prd";
  assert.enum(raw, ["dev", "prd"], "VAULT_KV_CONFIG must be dev or prd");
  return raw;
}

export function vaultKvCliPath(config: VaultKvConfig = defaultVaultKvConfig()): string {
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  const path = `secret/personal/${config}`;
  assert.nonEmptyString(path, "vault KV CLI path must be non-empty");
  return path;
}

export function vaultKvDataPath(config: VaultKvConfig = defaultVaultKvConfig()): string {
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  const path = `secret/data/personal/${config}`;
  assert.nonEmptyString(path, "vault KV data path must be non-empty");
  return path;
}

export function authHelp(kvPath: string): void {
  assert.nonEmptyString(kvPath, "vault KV path must be non-empty");
  console.error(`
Vault auth failed (token missing, expired, or lacks read on ${kvPath}).

Fix one of:
  1. Re-login, then retry:
       vault login -method=userpass username=crvouga
       # or: vault login <root-or-dev-token>
       cd 9router && npm start   # Secrets: Pull

  2. Inject via vault run (same login required):
       vault run -- npm start   # then choose the command from the menu

  3. Create a scoped read token (needs an admin/root session first):
       cd ${REPO_ROOT}/packages/vault-service && ./scripts/create-dev-token.sh
       vault login <printed-token>

  4. Or paste the four keys into ${ENV_FILE} manually (see .env.example).

Seed Vault (prefixed keys):
  vault kv patch ${kvPath} \\
    9ROUTER_PASSWORD='…' \\
    9ROUTER_JWT_SECRET='…' \\
    9ROUTER_API_KEY_SECRET='…' \\
    9ROUTER_MACHINE_ID_SALT='…'
`);
}

/** Resolve one app secret from KV data (prefixed key wins over legacy). */
export function resolveSecretFromKv(
  appKey: SecretKey,
  kvData: Record<string, string>,
): string | undefined {
  assert.nonEmptyString(appKey, "app secret key label must be non-empty");
  assert.record(kvData, "vault KV data must be a record", { appKey });
  for (const vaultKey of VAULT_TO_APP_SECRET_MAP[appKey]) {
    const value = kvData[vaultKey]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Map Vault KV fields to upstream 9router env var names. */
export function resolveAppSecrets(
  kvData: Record<string, string>,
): Partial<Record<SecretKey, string>> {
  assert.record(kvData, "vault KV data must be a record");
  assert.nonNegative(
    Object.keys(kvData).length,
    "vault KV field count must be non-negative",
  );
  const out: Partial<Record<SecretKey, string>> = {};
  for (const key of SECRET_KEYS) {
    const value = resolveSecretFromKv(key, kvData);
    if (value) out[key] = value;
  }
  return out;
}

export async function fetchVaultKvViaApi(
  config: VaultKvConfig = defaultVaultKvConfig(),
): Promise<Record<string, string>> {
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  const token = process.env.VAULT_TOKEN?.trim();
  if (!token) throw new Error("VAULT_TOKEN not set");
  const addr = (
    process.env.VAULT_ADDR?.trim() || "https://vault.chrisvouga.dev"
  ).replace(/\/$/, "");
  const path = vaultKvDataPath(config);
  const res = await fetch(`${addr}/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vault GET ${path} failed (${res.status}): ${text}`);
  }
  const body = (await res.json()) as { data?: { data?: Record<string, string> } };
  const data = body.data?.data ?? {};
  assert.record(data, "vault KV response data must be a record", { config });
  return data;
}

export function fetchVaultKvViaCli(
  config: VaultKvConfig = defaultVaultKvConfig(),
): Record<string, string> {
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  requireCmd("vault");
  const kvPath = vaultKvCliPath(config);
  const result = run("vault", ["kv", "get", "-format=json", kvPath], {
    allowFail: true,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    const err = new Error(detail || `vault kv get ${kvPath} failed`);
    (err as Error & { vaultDetail?: string }).vaultDetail = detail;
    throw err;
  }
  const body = JSON.parse(result.stdout) as {
    data?: { data?: Record<string, string> };
  };
  const data = body.data?.data ?? {};
  assert.record(data, "vault KV CLI data must be a record", { config });
  return data;
}

/** Read KV via VAULT_TOKEN API, falling back to active vault login session. */
export async function fetchVaultKv(
  config: VaultKvConfig = defaultVaultKvConfig(),
): Promise<Record<string, string>> {
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  try {
    return await fetchVaultKvViaApi(config);
  } catch {
    return fetchVaultKvViaCli(config);
  }
}

/** Apply vault run–injected 9ROUTER_* env vars to upstream app env names. */
export function applyVaultRunEnv(): void {
  assert.nonEmptyArray(
    SECRET_KEYS,
    "app secret key labels must be non-empty",
  );
  for (const appKey of SECRET_KEYS) {
    if (process.env[appKey]?.trim()) continue;
    for (const vaultKey of VAULT_TO_APP_SECRET_MAP[appKey]) {
      const value = process.env[vaultKey]?.trim();
      if (value) {
        process.env[appKey] = value;
        break;
      }
    }
  }
}

function vaultAddr(): string {
  return (
    process.env.VAULT_ADDR?.trim() || "https://vault.chrisvouga.dev"
  ).replace(/\/$/, "");
}

/** Patch KV via HTTP merge-patch (requires VAULT_TOKEN). */
export async function patchVaultKvViaApi(
  fields: Record<string, string>,
  config: VaultKvConfig = defaultVaultKvConfig(),
): Promise<void> {
  assert.record(fields, "vault patch fields must be a record", { config });
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  const token = process.env.VAULT_TOKEN?.trim();
  if (!token) throw new Error("VAULT_TOKEN not set");
  if (Object.keys(fields).length === 0) return;
  const path = vaultKvDataPath(config);
  const res = await fetch(`${vaultAddr()}/v1/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/merge-patch+json",
    },
    body: JSON.stringify({ data: fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vault PATCH ${path} failed (${res.status}): ${text}`);
  }
}

/** Patch KV via `vault kv patch` (active vault login session). */
export function patchVaultKvViaCli(
  fields: Record<string, string>,
  config: VaultKvConfig = defaultVaultKvConfig(),
): void {
  assert.record(fields, "vault patch fields must be a record", { config });
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  requireCmd("vault");
  if (Object.keys(fields).length === 0) return;
  const kvPath = vaultKvCliPath(config);
  const lookup = run("vault", ["token", "lookup"], { allowFail: true });
  if (lookup.status !== 0) {
    throw new Error(
      `Not authenticated to Vault. Run: vault login -method=userpass username=crvouga`,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "9r-vault-patch-"));
  const file = join(dir, "patch.json");
  try {
    writeFileSync(file, JSON.stringify(fields), { mode: 0o600 });
    const result = run("vault", ["kv", "patch", kvPath, `@${file}`], {
      allowFail: true,
    });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout).trim();
      throw new Error(
        `vault kv patch ${kvPath} failed${detail ? `: ${detail}` : ""}`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Patch secret/personal/{config} — HTTP when VAULT_TOKEN works, else CLI session.
 */
export async function patchVaultKv(
  fields: Record<string, string>,
  config: VaultKvConfig = defaultVaultKvConfig(),
): Promise<void> {
  assert.record(fields, "vault patch fields must be a record", { config });
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  if (Object.keys(fields).length === 0) return;
  if (process.env.VAULT_TOKEN?.trim()) {
    try {
      await patchVaultKvViaApi(fields, config);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("403") && !msg.includes("permission denied")) {
        throw err;
      }
    }
  }
  patchVaultKvViaCli(fields, config);
}
