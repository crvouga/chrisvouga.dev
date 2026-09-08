import { assert } from '@pkgs/assert';
import { SecretStoreError } from './secret-store-error';

export class SecretStoreParseError extends SecretStoreError {
  constructor(message: string) {
    assert.nonEmptyString(
      message,
      'SecretStoreParseError: message must be non-empty'
    );
    super(message);
    this.name = 'SecretStoreParseError';
    assert.equals(
      this.name,
      'SecretStoreParseError',
      'SecretStoreParseError: name invariant'
    );
  }
}
