import { assert } from '@pkgs/assert';
import { SecretStoreError } from './secret-store-error';

export class SecretStoreRequestError extends SecretStoreError {
  constructor(
    message: string,
    readonly status?: number
  ) {
    assert.nonEmptyString(
      message,
      'SecretStoreRequestError: message must be non-empty'
    );
    assert.ok(
      status === undefined || (Number.isInteger(status) && status >= 0),
      'SecretStoreRequestError: status must be a non-negative integer when provided'
    );
    super(message);
    this.name = 'SecretStoreRequestError';
    assert.equals(
      this.status,
      status,
      'SecretStoreRequestError: status invariant'
    );
  }
}
