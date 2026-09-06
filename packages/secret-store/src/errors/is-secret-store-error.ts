import { SecretStoreError } from './secret-store-error';

export function isSecretStoreError(value: unknown): value is SecretStoreError {
  return value instanceof SecretStoreError;
}
