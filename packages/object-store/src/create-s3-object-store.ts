import { assert } from '@pkgs/assert';
import {
  ObjectStoreImplS3,
  type ObjectStoreS3ConnectionConfig,
} from './impl-s3';
import type { ObjectStore } from './interface';
import { validateStoreNamespace } from './object-key';

export function createS3ObjectStore(
  config: ObjectStoreS3ConnectionConfig,
  storeNamespace: string
): ObjectStore {
  assert.record(config, 'createS3ObjectStore: config must be an object');
  assert.nonEmptyString(
    storeNamespace,
    'createS3ObjectStore: storeNamespace must be non-empty'
  );
  validateStoreNamespace(storeNamespace);
  const store = new ObjectStoreImplS3({ ...config, storeNamespace });
  assert.ok(
    store instanceof ObjectStoreImplS3,
    'createS3ObjectStore: must return ObjectStoreImplS3'
  );
  return store;
}
