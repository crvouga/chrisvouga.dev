import { assert } from '@pkgs/assert';

import { VaultSecretKey } from '../../scripts/vault-secrets-registry';

/** Vault secret names loaded at server boot. */
export const CacheSecretName = {
  turboToken: VaultSecretKey.turboToken,
  b2S3Endpoint: VaultSecretKey.b2S3Endpoint,
  b2S3Region: VaultSecretKey.b2S3Region,
  b2S3AccessKeyId: VaultSecretKey.b2S3AccessKeyId,
  b2S3SecretAccessKey: VaultSecretKey.b2S3SecretAccessKey,
  b2Bucket: VaultSecretKey.b2Bucket,
} as const;

assert.equals(
  CacheSecretName.turboToken,
  VaultSecretKey.turboToken,
  'turboToken must match registry'
);
assert.equals(
  CacheSecretName.b2S3Endpoint,
  VaultSecretKey.b2S3Endpoint,
  'b2S3Endpoint must match registry'
);
assert.equals(
  CacheSecretName.b2S3Region,
  VaultSecretKey.b2S3Region,
  'b2S3Region must match registry'
);
assert.equals(
  CacheSecretName.b2S3AccessKeyId,
  VaultSecretKey.b2S3AccessKeyId,
  'b2S3AccessKeyId must match registry'
);
assert.equals(
  CacheSecretName.b2S3SecretAccessKey,
  VaultSecretKey.b2S3SecretAccessKey,
  'b2S3SecretAccessKey must match registry'
);
assert.equals(
  CacheSecretName.b2Bucket,
  VaultSecretKey.b2Bucket,
  'b2Bucket must match registry'
);
for (const name of Object.values(CacheSecretName)) {
  assert.nonEmptyString(name, 'secret name must be non-empty');
}
