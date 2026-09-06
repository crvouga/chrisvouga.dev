import { createS3ObjectStore } from '@pkgs/object-store/create-s3-object-store';
import type { ObjectStore } from '@pkgs/object-store/interface';
import type { SecretStore } from '@pkgs/secret-store';

import { CACHE_OBJECT_STORE_NAMESPACE } from '../config/object-store-namespace';
import { CacheSecretName } from '../config/secret-names';

export type CacheBootConfig = {
  readonly turboToken: string;
  readonly objectStore: ObjectStore;
};

export async function loadCacheBootConfig(
  secretStore: SecretStore
): Promise<CacheBootConfig> {
  const [turboToken, endpoint, region, accessKeyId, secretAccessKey, bucket] =
    await Promise.all([
      secretStore.getRequired(CacheSecretName.turboToken),
      secretStore.getRequired(CacheSecretName.b2S3Endpoint),
      secretStore.getRequired(CacheSecretName.b2S3Region),
      secretStore.getRequired(CacheSecretName.b2S3AccessKeyId),
      secretStore.getRequired(CacheSecretName.b2S3SecretAccessKey),
      secretStore.getRequired(CacheSecretName.b2Bucket),
    ]);

  const objectStore = createS3ObjectStore(
    {
      endpoint: endpoint.readSecretValue(),
      region: region.readSecretValue(),
      accessKeyId: accessKeyId.readSecretValue(),
      secretAccessKey: secretAccessKey.readSecretValue(),
      bucket: bucket.readSecretValue(),
    },
    CACHE_OBJECT_STORE_NAMESPACE
  );

  return {
    turboToken: turboToken.readSecretValue(),
    objectStore,
  };
}
