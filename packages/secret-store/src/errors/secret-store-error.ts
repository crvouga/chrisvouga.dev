import { assert } from '@pkgs/assert';

/** Base for all secret-store failures (Tiger Style: typed, loud). */
export class SecretStoreError extends Error {
  constructor(message: string) {
    assert.nonEmptyString(
      message,
      'SecretStoreError: message must be non-empty'
    );
    super(message);
    this.name = 'SecretStoreError';
    assert.equals(
      this.name,
      'SecretStoreError',
      'SecretStoreError: name invariant'
    );
  }
}
