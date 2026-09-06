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
  validateStoreNamespace(storeNamespace);
  return new ObjectStoreImplS3({ ...config, storeNamespace });
}
