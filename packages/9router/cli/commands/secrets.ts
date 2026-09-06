import { ENV_FILE, SECRET_KEYS } from "../../scripts/lib/paths.ts";
import { ensureEnvFile, upsertEnv } from "../../scripts/lib/env.ts";
import {
  allSecretsFromEnv,
  ensureAppSecrets,
} from "../../scripts/lib/secrets.ts";
import {
  defaultVaultKvConfig,
  vaultKvCliPath,
} from "../../scripts/lib/vault.ts";
import type { Command } from "../types.ts";

export async function pullSecrets(): Promise<void> {
  const kvPath = vaultKvCliPath(defaultVaultKvConfig());
  ensureEnvFile();

  const fromEnv = allSecretsFromEnv();
  if (fromEnv) {
    console.log("==> Using secrets from environment");
    for (const key of SECRET_KEYS) {
      upsertEnv(key, fromEnv[key]);
      console.log(`  wrote ${key}`);
    }
    console.log(`Done. Secrets written to ${ENV_FILE}`);
    return;
  }

  console.log(`==> Reading secrets from ${kvPath}...`);
  await ensureAppSecrets({ writeEnv: true });
  for (const key of SECRET_KEYS) {
    console.log(`  wrote ${key}`);
  }
  console.log(`Done. Secrets written to ${ENV_FILE}`);
}

export const secretsCommands: Command[] = [
  {
    id: "pull-secrets",
    name: "Secrets: Pull",
    description: "Write app secrets from Vault (or env) into .env",
    run: pullSecrets,
  },
];
