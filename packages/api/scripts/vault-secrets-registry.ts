/** Public hostname for the self-hosted Turborepo remote cache server. */
export const CACHE_PUBLIC_HOSTNAME = 'turborepo.chrisvouga.dev';

/** Cloudflare DNS zone for {@link CACHE_PUBLIC_HOSTNAME}. */
export const CACHE_DNS_ZONE = 'chrisvouga.dev';

/** Public origin for the self-hosted Turborepo remote cache server. */
export const CACHE_PUBLIC_ORIGIN = `https://${CACHE_PUBLIC_HOSTNAME}`;

/** GHCR repository for the cache server image (CI publishes via infra ci-turborepo workflow). */
export const GHCR_IMAGE_REPOSITORY = 'ghcr.io/crvouga/chrisvouga-turborepo';

export type SecretUsedBy = 'server' | 'client';

export type SecretDefinition = {
  readonly key: string;
  readonly required: boolean;
  readonly usedBy: readonly SecretUsedBy[];
  readonly hint: string;
  /** When set, `ensure-vault-secrets` writes this value if the key is missing. */
  readonly defaultValue?: string;
};

/** Stable Vault secret key literals — single source of truth. */
export const VaultSecretKey = {
  turboToken: 'TURBO_TOKEN',
  turboApi: 'TURBO_API',
  turboTeam: 'TURBO_TEAM',
  turboCache: 'TURBO_CACHE',
  turboLogOrder: 'TURBO_LOG_ORDER',
  turboTelemetryDisabled: 'TURBO_TELEMETRY_DISABLED',
  b2S3Endpoint: 'B2_S3_ENDPOINT',
  b2S3Region: 'B2_S3_REGION',
  b2S3AccessKeyId: 'B2_S3_ACCESS_KEY_ID',
  b2S3SecretAccessKey: 'B2_S3_SECRET_ACCESS_KEY',
  b2Bucket: 'B2_BUCKET',
  vaultToken: 'VAULT_TOKEN',
} as const;

export const VAULT_SECRET_REGISTRY: readonly SecretDefinition[] = [
  {
    key: VaultSecretKey.turboToken,
    required: true,
    usedBy: ['server', 'client'],
    hint: 'Bearer token Turbo clients send and the cache server validates',
  },
  {
    key: VaultSecretKey.turboApi,
    required: true,
    usedBy: ['client'],
    hint: 'Self-hosted cache URL (TURBO_API env for turbo CLI)',
    defaultValue: CACHE_PUBLIC_ORIGIN,
  },
  {
    key: VaultSecretKey.turboTeam,
    required: true,
    usedBy: ['client'],
    hint: 'Any team slug (e.g. local) — required by turbo CLI for remote cache',
    defaultValue: 'local',
  },
  {
    key: VaultSecretKey.b2S3Endpoint,
    required: true,
    usedBy: ['server'],
    hint: 'Backblaze B2 S3 endpoint URL (e.g. https://s3.us-west-004.backblazeb2.com)',
  },
  {
    key: VaultSecretKey.b2S3Region,
    required: true,
    usedBy: ['server'],
    hint: 'B2 region slug (e.g. us-west-004)',
  },
  {
    key: VaultSecretKey.b2S3AccessKeyId,
    required: true,
    usedBy: ['server'],
    hint: 'B2 application key ID for the S3-compatible API (starts with 004)',
  },
  {
    key: VaultSecretKey.b2S3SecretAccessKey,
    required: true,
    usedBy: ['server'],
    hint: 'B2 application key secret (shown once at key creation; starts with K)',
  },
  {
    key: VaultSecretKey.b2Bucket,
    required: true,
    usedBy: ['server'],
    hint: 'B2 bucket name for cache artifacts',
  },
  {
    key: VaultSecretKey.vaultToken,
    required: true,
    usedBy: ['server'],
    hint: 'Long-lived Vault read token for server boot-time secret loading',
  },
  {
    key: VaultSecretKey.turboCache,
    required: false,
    usedBy: ['client'],
    hint: 'Turbo --cache flag default (e.g. remote:rw)',
    defaultValue: 'remote:rw',
  },
  {
    key: VaultSecretKey.turboLogOrder,
    required: false,
    usedBy: ['client'],
    hint: 'Turbo log order (e.g. stream)',
  },
  {
    key: VaultSecretKey.turboTelemetryDisabled,
    required: false,
    usedBy: ['client'],
    hint: 'Set to 1 to disable Turbo telemetry',
  },
] as const;

export const VAULT_CONFIGS = ['dev', 'prd'] as const;

/** Turbo env vars consumer monorepos need to use this self-hosted cache. */
export const TURBO_CLIENT_REQUIRED_KEYS = [
  VaultSecretKey.turboToken,
  VaultSecretKey.turboApi,
  VaultSecretKey.turboTeam,
  VaultSecretKey.turboCache,
] as const;

/** Optional Turbo client env vars copied when set in the source config. */
export const TURBO_CLIENT_OPTIONAL_KEYS = [
  VaultSecretKey.turboLogOrder,
  VaultSecretKey.turboTelemetryDisabled,
] as const;

export function turboClientRegistryDefaults(): Readonly<
  Record<string, string | undefined>
> {
  const defaults: Record<string, string | undefined> = {};
  for (const def of VAULT_SECRET_REGISTRY) {
    if (def.defaultValue !== undefined) {
      defaults[def.key] = def.defaultValue;
    }
  }
  return defaults;
}

const TURBO_CACHE_RE = /^(local|remote):(r|rw|w)?(,(local|remote):(r|rw|w)?)?$/;

export function validateOptionalSecretFormat(
  key: string,
  value: string
): string | null {
  if (key === VaultSecretKey.turboApi) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') {
        return `TURBO_API must be an https URL, got ${value}`;
      }
    } catch {
      return `TURBO_API must be a valid URL, got ${value}`;
    }
  }
  if (key === VaultSecretKey.turboCache && !TURBO_CACHE_RE.test(value)) {
    return `Invalid TURBO_CACHE "${value}" (expected e.g. remote:rw)`;
  }
  return null;
}
