import { VaultSecretKey } from '@scripts/vault-secrets-registry';

/** Vault secret names loaded at server boot. */
export const CacheSecretName = {
  turboToken: VaultSecretKey.turboToken,
  b2S3Endpoint: VaultSecretKey.b2S3Endpoint,
  b2S3Region: VaultSecretKey.b2S3Region,
  b2S3AccessKeyId: VaultSecretKey.b2S3AccessKeyId,
  b2S3SecretAccessKey: VaultSecretKey.b2S3SecretAccessKey,
  b2Bucket: VaultSecretKey.b2Bucket,
} as const;
