import { Assert, assert, hotAssert } from '@pkgs/assert';
import { SecretStoreEntry, type SecretUsedBy } from '@pkgs/secret-store';

const ha: Assert = hotAssert();
const validationAssert: Assert = Assert.validation();

/** Public hostname for the self-hosted Turborepo remote cache server. */
export const CACHE_PUBLIC_HOSTNAME = 'turborepo.chrisvouga.dev';

/** Cloudflare DNS zone for {@link CACHE_PUBLIC_HOSTNAME}. */
export const CACHE_DNS_ZONE = 'chrisvouga.dev';

/** Public origin for the self-hosted Turborepo remote cache server. */
export const CACHE_PUBLIC_ORIGIN = `https://${CACHE_PUBLIC_HOSTNAME}`;

/** GHCR repository for the cache server image (CI publishes via infra ci-turborepo workflow). */
export const GHCR_IMAGE_REPOSITORY = 'ghcr.io/crvouga/chrisvouga-turborepo';

/** Base Vault UI link for the cache-secret KV path (project/config appended). */
export const VAULT_UI_BASE =
  'https://vault.chrisvouga.dev/ui/vault/secrets/secret/show';

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

const TURBO_CACHE_RE = /^(local|remote):(r|rw|w)?(,(local|remote):(r|rw|w)?)?$/;

function validateHttpsUrl(value: string): string | null {
  validationAssert.nonEmptyString(value, 'TURBO_API must be non-empty');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      return `${VaultSecretKey.turboApi} must be an https URL, got ${value}`;
    }
  } catch {
    return `${VaultSecretKey.turboApi} must be a valid URL, got ${value}`;
  }
  return null;
}

function validateTurboCache(value: string): string | null {
  validationAssert.nonEmptyString(value, 'TURBO_CACHE must be non-empty');
  if (!TURBO_CACHE_RE.test(value)) {
    return `Invalid ${VaultSecretKey.turboCache} "${value}" (expected e.g. remote:rw)`;
  }
  return null;
}

function validateB2AccessKeyId(value: string): string | null {
  validationAssert.nonEmptyString(
    value,
    'B2_S3_ACCESS_KEY_ID must be non-empty'
  );
  if (!value.startsWith('004')) {
    return `${VaultSecretKey.b2S3AccessKeyId} must start with "004", got ${value}`;
  }
  return null;
}

function validateB2SecretAccessKey(value: string): string | null {
  validationAssert.nonEmptyString(
    value,
    'B2_S3_SECRET_ACCESS_KEY must be non-empty'
  );
  if (!value.startsWith('K')) {
    return `${VaultSecretKey.b2S3SecretAccessKey} must start with "K", got ${value}`;
  }
  return null;
}

/** Central register of every secret expected in the secret store. */
export const VAULT_SECRET_REGISTRY: readonly SecretStoreEntry[] = [
  new SecretStoreEntry({
    key: VaultSecretKey.turboToken,
    required: true,
    usedBy: ['server', 'client'],
    hint: 'Bearer token Turbo clients send and the cache server validates',
    description: 'Shared secret for the self-hosted Turborepo remote cache.',
    docsUrl: 'https://turborepo.com/docs/reference/remote-caching',
    obtainUrl: `${VAULT_UI_BASE}/personal/{{config}}`,
    vaultUiPath: `${VAULT_UI_BASE}/personal/{{config}}`,
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.turboApi,
    required: true,
    usedBy: ['client'],
    hint: 'Self-hosted cache URL (TURBO_API env for turbo CLI)',
    seed: () => CACHE_PUBLIC_ORIGIN,
    transform: (value) => value.replace(/\/+$/, ''),
    validate: validateHttpsUrl,
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.turboTeam,
    required: true,
    usedBy: ['client'],
    hint: 'Any team slug (e.g. local) — required by turbo CLI for remote cache',
    seed: () => 'local',
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.b2S3Endpoint,
    required: true,
    usedBy: ['server'],
    hint: 'Backblaze B2 S3 endpoint URL (e.g. https://s3.us-west-004.backblazeb2.com)',
    obtainUrl: 'https://secure.backblaze.com/b2_buckets.htm',
    validExample: 'https://s3.us-west-004.backblazeb2.com',
    invalidHint:
      'Copy the S3 endpoint from the B2 application key details page.',
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.b2S3Region,
    required: true,
    usedBy: ['server'],
    hint: 'B2 region slug (e.g. us-west-004)',
    validExample: 'us-west-004',
    invalidHint:
      "The region matches the bucket's datacenter (e.g. us-west-004).",
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.b2S3AccessKeyId,
    required: true,
    usedBy: ['server'],
    hint: 'B2 application key ID for the S3-compatible API (starts with 004)',
    obtainUrl: 'https://secure.backblaze.com/app_keys.htm',
    validExample: '0046…',
    invalidHint: 'Recreate the application key; the key ID starts with "004".',
    validate: validateB2AccessKeyId,
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.b2S3SecretAccessKey,
    required: true,
    usedBy: ['server'],
    hint: 'B2 application key secret (shown once at key creation; starts with K)',
    obtainUrl: 'https://secure.backblaze.com/app_keys.htm',
    validExample: 'K…',
    invalidHint:
      'The secret is only shown once — recreate the key if it was lost.',
    validate: validateB2SecretAccessKey,
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.b2Bucket,
    required: true,
    usedBy: ['server'],
    hint: 'B2 bucket name for cache artifacts',
    obtainUrl: 'https://secure.backblaze.com/b2_buckets.htm',
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.vaultToken,
    required: true,
    usedBy: ['server'],
    hint: 'Long-lived Vault read token for server boot-time secret loading',
    docsUrl: 'https://openbao.org/docs/concepts/tokens/',
    obtainUrl: `${VAULT_UI_BASE}/personal/{{config}}`,
    invalidHint:
      'Create a long-lived read token via `vault token create -policy=default`.',
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.turboCache,
    required: false,
    usedBy: ['client'],
    hint: 'Turbo --cache flag default (e.g. remote:rw)',
    seed: () => 'remote:rw',
    validate: validateTurboCache,
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.turboLogOrder,
    required: false,
    usedBy: ['client'],
    hint: 'Turbo log order (e.g. stream)',
  }),
  new SecretStoreEntry({
    key: VaultSecretKey.turboTelemetryDisabled,
    required: false,
    usedBy: ['client'],
    hint: 'Set to 1 to disable Turbo telemetry',
  }),
];

export const VAULT_CONFIGS = ['dev', 'prd'] as const;

assert.nonEmptyArray(VAULT_CONFIGS, 'vault configs must be non-empty');
for (const key of Object.values(VaultSecretKey)) {
  assert.nonEmptyString(key, 'vault secret key must be non-empty');
}
assert.nonEmptyArray(
  VAULT_SECRET_REGISTRY,
  'vault secret registry must be non-empty'
);
for (const def of VAULT_SECRET_REGISTRY) {
  assert.nonEmptyString(def.key, 'registry entry key must be non-empty');
}

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
  assert.nonEmptyArray(VAULT_SECRET_REGISTRY, 'registry must have entries');
  const defaults: Record<string, string | undefined> = {};
  for (const def of VAULT_SECRET_REGISTRY) {
    ha.nonEmptyString(def.key, 'registry entry key must be non-empty');
    const value = def.seed();
    if (value !== undefined) {
      defaults[def.key] = value;
    }
  }
  assert.record(defaults, 'registry defaults must be a record');
  return defaults;
}

export type { SecretUsedBy };
