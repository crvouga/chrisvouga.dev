import { assert } from '@pkgs/assert';
import { SecretStoreError } from './secret-store-error';

export class SecretMissingError extends SecretStoreError {
  constructor(readonly secretName: string) {
    assert.nonEmptyString(
      secretName,
      'SecretMissingError: secretName must be non-empty'
    );
    super(`Secret "${secretName}" is missing from the secret store`);
    this.name = 'SecretMissingError';
    assert.equals(
      this.secretName,
      secretName,
      'SecretMissingError: secretName invariant'
    );
  }
}
