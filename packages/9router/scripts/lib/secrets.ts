import { applyEnvFile, ensureEnvFile, upsertEnv } from "./env.ts";
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import { ENV_FILE, SECRET_KEYS, type SecretKey } from "./paths.ts";
import {
  applyVaultRunEnv,
  authHelp,
  defaultVaultKvConfig,
  fetchVaultKv,
  resolveAppSecrets,
  VAULT_TO_APP_SECRET_MAP,
  vaultKvCliPath,
} from "./vault.ts";

export type EnsureAppSecretsOptions = {
  /** Write resolved secrets into .env (pull-secrets behavior). */
  writeEnv?: boolean;
};

function missingSecretKeys(): SecretKey[] {
  assert.nonEmptyArray(SECRET_KEYS, "secret key labels must be non-empty");
  return SECRET_KEYS.filter((key) => !process.env[key]?.trim());
}

function allSecretsPresent(): boolean {
  return missingSecretKeys().length === 0;
}

function applySecretsToProcessEnv(secrets: Partial<Record<SecretKey, string>>): void {
  assert.record(secrets, "resolved secrets container must be a record");
  for (const key of SECRET_KEYS) {
    ha.nonEmptyString(key, "secret key label must be non-empty");
    const value = secrets[key]?.trim();
    if (value) process.env[key] = value;
  }
}

/**
 * Ensure upstream 9router secrets are in process.env.
 * Order: existing env → .env file → vault run injection → Vault KV fetch.
 */
export async function ensureAppSecrets(
  opts: EnsureAppSecretsOptions = {},
): Promise<void> {
  assert.record(opts, "ensure secrets options must be a record");
  applyEnvFile(ENV_FILE);
  applyVaultRunEnv();

  if (allSecretsPresent()) return;

  const config = defaultVaultKvConfig();
  assert.enum(config, ["dev", "prd"], "vault KV config must be dev or prd");
  const kvPath = vaultKvCliPath(config);
  assert.nonEmptyString(kvPath, "vault KV path must be non-empty");

  let kvData: Record<string, string> = {};
  let lastError = "";
  try {
    kvData = await fetchVaultKv(config);
  } catch (err) {
    lastError =
      (err as Error & { vaultDetail?: string }).vaultDetail ||
      (err instanceof Error ? err.message : String(err));
  }

  if (Object.keys(kvData).length === 0) {
    const stillMissing = missingSecretKeys();
    if (stillMissing.length === 0) return;

    console.error(
      `ERROR: missing secrets: ${stillMissing.join(", ")} (could not read ${kvPath})`,
    );
    if (lastError) {
      for (const line of lastError.split(/\r?\n/)) console.error(`  ${line}`);
    }
    authHelp(kvPath);
    process.exit(1);
  }

  const resolved = resolveAppSecrets(kvData);
  applySecretsToProcessEnv(resolved);

  const stillMissing = missingSecretKeys();
  assert.array(stillMissing, "missing secret labels must be an array");
  if (stillMissing.length > 0) {
    console.error(`ERROR: missing in ${kvPath}:`);
    for (const key of stillMissing) {
      console.error(`  ${key} (try Vault: ${VAULT_TO_APP_SECRET_MAP[key].join(" or ")})`);
    }
    authHelp(kvPath);
    process.exit(1);
  }

  if (opts.writeEnv) {
    ensureEnvFile();
    for (const key of SECRET_KEYS) {
      ha.nonEmptyString(key, "secret key label must be non-empty");
      // NOTE: secret bytes never enter assert context — only the key label.
      assert.ok(
        typeof process.env[key] === "string" && (process.env[key] as string).length > 0,
        "resolved secret must be present before writing env",
        { key },
      );
      upsertEnv(key, process.env[key]!);
    }
  }
}

/** All four secrets present in process.env (after vault run injection). */
export function allSecretsFromEnv(): Record<SecretKey, string> | null {
  applyVaultRunEnv();
  const out = {} as Record<SecretKey, string>;
  for (const key of SECRET_KEYS) {
    ha.nonEmptyString(key, "secret key label must be non-empty");
    const value = process.env[key]?.trim();
    if (!value) return null;
    out[key] = value;
  }
  assert.ok(
    Object.keys(out).length === SECRET_KEYS.length,
    "env secrets must cover every secret key label",
    { count: Object.keys(out).length, expected: SECRET_KEYS.length },
  );
  return out;
}
