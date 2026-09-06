import { applyEnvFile, ensureEnvFile, upsertEnv } from "./env.ts";
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
  return SECRET_KEYS.filter((key) => !process.env[key]?.trim());
}

function allSecretsPresent(): boolean {
  return missingSecretKeys().length === 0;
}

function applySecretsToProcessEnv(secrets: Partial<Record<SecretKey, string>>): void {
  for (const key of SECRET_KEYS) {
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
  applyEnvFile(ENV_FILE);
  applyVaultRunEnv();

  if (allSecretsPresent()) return;

  const config = defaultVaultKvConfig();
  const kvPath = vaultKvCliPath(config);

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
      upsertEnv(key, process.env[key]!);
    }
  }
}

/** All four secrets present in process.env (after vault run injection). */
export function allSecretsFromEnv(): Record<SecretKey, string> | null {
  applyVaultRunEnv();
  const out = {} as Record<SecretKey, string>;
  for (const key of SECRET_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) return null;
    out[key] = value;
  }
  return out;
}
