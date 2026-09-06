/**
 * Runtime environment for the Turborepo remote cache server.
 *
 * Only `VAULT_TOKEN` is a deploy-time secret. B2 creds, cache bearer token,
 * and all other config load from Vault at boot.
 */
export type CacheServerEnv = {
  VAULT_TOKEN: string;
  VAULT_ADDR?: string;
  VAULT_PROJECT?: string;
  VAULT_CONFIG?: string;
  PORT: number;
};

/**
 * Non-recoverable misconfiguration at the env trust boundary. Signals to the
 * top-level handler that the process must latch a fatal state and refuse to
 * serve traffic.
 */
export class ConfigurationError extends Error {
  readonly __configuration_error = true as const;

  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const DEFAULT_PORT = 8787;

function readOptionalEnv(key: string): string | null {
  const raw = process.env[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPort(): number {
  const raw = readOptionalEnv('PORT');
  if (raw === null) return DEFAULT_PORT;
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
    throw new ConfigurationError(`PORT must be a valid TCP port, got "${raw}"`);
  }
  return port;
}

export function readCacheServerEnv(): CacheServerEnv {
  const vaultToken = readOptionalEnv('VAULT_TOKEN');
  if (vaultToken === null) {
    throw new ConfigurationError(
      'VAULT_TOKEN is required (non-empty string). Set it in the environment or add it to apps/api/.env; remaining config is loaded from Vault.'
    );
  }

  return {
    VAULT_TOKEN: vaultToken,
    ...(readOptionalEnv('VAULT_ADDR') !== null
      ? { VAULT_ADDR: readOptionalEnv('VAULT_ADDR')! }
      : {}),
    ...(readOptionalEnv('VAULT_PROJECT') !== null
      ? { VAULT_PROJECT: readOptionalEnv('VAULT_PROJECT')! }
      : {}),
    ...(readOptionalEnv('VAULT_CONFIG') !== null
      ? { VAULT_CONFIG: readOptionalEnv('VAULT_CONFIG')! }
      : {}),
    PORT: readPort(),
  };
}

export function assertVaultToken(env: CacheServerEnv): string {
  return env.VAULT_TOKEN;
}

export function readVaultScopeBindings(env: CacheServerEnv): {
  addr: string | null;
  project: string | null;
  config: string | null;
} {
  return {
    addr: env.VAULT_ADDR ?? null,
    project: env.VAULT_PROJECT ?? null,
    config: env.VAULT_CONFIG ?? null,
  };
}
