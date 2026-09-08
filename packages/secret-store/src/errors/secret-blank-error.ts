import { assert } from '@pkgs/assert';
import { SecretStoreError } from './secret-store-error';

export class SecretBlankError extends SecretStoreError {
  constructor(readonly secretName: string) {
    assert.nonEmptyString(
      secretName,
      'SecretBlankError: secretName must be non-empty'
    );
    super(`Secret "${secretName}" is present but empty or whitespace-only`);
    this.name = 'SecretBlankError';
    assert.equals(
      this.secretName,
      secretName,
      'SecretBlankError: secretName invariant'
    );
  }
}
