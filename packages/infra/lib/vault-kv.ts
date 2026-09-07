import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { loadServicesConfig, vaultAddr as vaultAddrFromConfig } from "./services.js";

const VAULT_KV_PATH = "secret/data/personal/prd";
/** KV v2 CLI path (no `/data/` segment). */
export const VAULT_KV_CLI_PATH = "secret/personal/prd";

export const VAULT_KV_CONFIGS = ["dev", "prd"] as const;
export type VaultKvConfig = (typeof VAULT_KV_CONFIGS)[number];

export function vaultKvDataPath(config: VaultKvConfig): string {
  return `secret/data/personal/${config}`;
}

export function defaultVaultAddr(): string {
  try {
    return vaultAddrFromConfig(loadServicesConfig());
  } catch {
    return process.env.VAULT_ADDR?.trim()?.replace(/\/$/, "") ?? "";
  }
}

export function resolveVaultAddr(explicit?: string): string {
  const addr =
    explicit?.trim() || process.env.VAULT_ADDR?.trim() || defaultVaultAddr();
  if (!addr) {
    throw new Error("VAULT_ADDR is required (set env or configure zone in services.yaml)");
  }
  return addr.replace(/\/$/, "");
}

function vaultToken(): string {
  const token = process.env.VAULT_TOKEN?.trim();
  if (!token) throw new Error("VAULT_TOKEN is required to write Vault secrets");
  return token;
}

export async function vaultKvGet(token?: string): Promise<Record<string, string>> {
  return vaultKvGetConfig("prd", token);
}

/** Read secret/personal/prd via VAULT_TOKEN API or active `vault login` session. */
export async function vaultKvGetPrd(): Promise<Record<string, string>> {
  if (process.env.VAULT_TOKEN?.trim()) {
    try {
      return await vaultKvGetConfig("prd");
    } catch {
      // fall through to CLI
    }
  }
  return vaultKvGetCli();
}

/** Patch secret/personal/prd via VAULT_TOKEN API or active `vault login` session. */
export async function vaultKvPatchPrd(fields: Record<string, string>): Promise<void> {
  if (process.env.VAULT_TOKEN?.trim()) {
    try {
      await vaultKvPatch(fields);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("403") && !msg.includes("permission denied")) {
        throw err;
      }
    }
  }
  await vaultKvPatchCli(fields);
}

export async function vaultKvGetConfig(
  config: VaultKvConfig,
  token?: string,
): Promise<Record<string, string>> {
  const addr = resolveVaultAddr();
  const auth = token ?? vaultToken();
  const path = vaultKvDataPath(config);
  const res = await fetch(`${addr}/v1/${path}`, {
    headers: { Authorization: `Bearer ${auth}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vault GET ${path} failed (${res.status}): ${text}`);
  }
  const body = (await res.json()) as { data?: { data?: Record<string, string> } };
  return body.data?.data ?? {};
}

/** True when the token can read secret/personal/{config}. */
export async function vaultKvConfigReadable(
  config: VaultKvConfig,
  token: string,
): Promise<boolean> {
  const addr = resolveVaultAddr();
  const res = await fetch(`${addr}/v1/${vaultKvDataPath(config)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export async function vaultKvPatch(fields: Record<string, string>): Promise<void> {
  const addr = resolveVaultAddr();
  const res = await fetch(`${addr}/v1/${VAULT_KV_PATH}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${vaultToken()}`,
      "Content-Type": "application/merge-patch+json",
    },
    body: JSON.stringify({ data: fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vault PATCH ${VAULT_KV_PATH} failed (${res.status}): ${text}`);
  }
}

/** Requires an active `vault login` session (uses ~/.vault-token, not VAULT_TOKEN). */
export async function requireVaultCliAuth(vaultAddr?: string): Promise<void> {
  const addr = resolveVaultAddr(vaultAddr);
  const lookup = await $`vault token lookup -format=json`
    .env({ ...process.env, VAULT_ADDR: addr })
    .quiet()
    .nothrow();
  if (lookup.exitCode !== 0) {
    throw new Error(
      `Not authenticated to Vault at ${addr}. Run:\n  VAULT_ADDR=${addr} vault login -method=userpass username=crvouga`,
    );
  }
}

/** Patch KV secrets via the Vault CLI (`vault kv patch`). */
export async function vaultKvPatchCli(
  fields: Record<string, string>,
  cliPath = VAULT_KV_CLI_PATH,
  vaultAddr?: string,
): Promise<void> {
  await requireVaultCliAuth(vaultAddr);
  const addr = resolveVaultAddr(vaultAddr);
  const dir = mkdtempSync(join(tmpdir(), "vault-kv-patch-"));
  const file = join(dir, "patch.json");
  try {
    writeFileSync(file, JSON.stringify(fields));
    const result = await $`vault kv patch ${cliPath} @${file}`
      .env({ ...process.env, VAULT_ADDR: addr })
      .nothrow();
    if (result.exitCode !== 0) {
      const detail = result.stderr.toString().trim() || result.stdout.toString().trim();
      throw new Error(`vault kv patch ${cliPath} failed: ${detail}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Read KV secrets via the Vault CLI (`vault kv get -format=json`). */
export async function vaultKvGetCli(vaultAddr?: string): Promise<Record<string, string>> {
  await requireVaultCliAuth(vaultAddr);
  const addr = resolveVaultAddr(vaultAddr);
  const result = await $`vault kv get -format=json ${VAULT_KV_CLI_PATH}`
    .env({ ...process.env, VAULT_ADDR: addr })
    .quiet()
    .nothrow();
  if (result.exitCode !== 0) {
    const detail = result.stderr.toString().trim() || result.stdout.toString().trim();
    throw new Error(`vault kv get ${VAULT_KV_CLI_PATH} failed: ${detail}`);
  }
  const body = JSON.parse(result.stdout.toString()) as {
    data?: { data?: Record<string, string> };
  };
  return body.data?.data ?? {};
}

export async function vaultKvDeleteKeysApi(
  keys: readonly string[],
  kvPath = VAULT_KV_PATH,
): Promise<void> {
  const nulls = Object.fromEntries(keys.map((k) => [k, null]));
  const addr = resolveVaultAddr();
  const res = await fetch(`${addr}/v1/${kvPath}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${vaultToken()}`,
      "Content-Type": "application/merge-patch+json",
    },
    body: JSON.stringify({ data: nulls }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vault PATCH ${kvPath} (delete keys) failed (${res.status}): ${text}`);
  }
}

/** Delete specific keys from KV via CLI (merge-patch null values). */
export async function vaultKvDeleteKeysCli(
  keys: readonly string[],
  cliPath = VAULT_KV_CLI_PATH,
  vaultAddr?: string,
): Promise<void> {
  const nulls = Object.fromEntries(keys.map((k) => [k, null]));
  await requireVaultCliAuth(vaultAddr);
  const addr = resolveVaultAddr(vaultAddr);
  const dir = mkdtempSync(join(tmpdir(), "vault-kv-delete-"));
  const file = join(dir, "patch.json");
  try {
    writeFileSync(file, JSON.stringify(nulls));
    const result = await $`vault kv patch ${cliPath} @${file}`
      .env({ ...process.env, VAULT_ADDR: addr })
      .nothrow();
    if (result.exitCode !== 0) {
      const detail = result.stderr.toString().trim() || result.stdout.toString().trim();
      throw new Error(`vault kv patch (delete keys) failed: ${detail}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
