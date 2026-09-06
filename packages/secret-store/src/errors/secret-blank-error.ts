import { SecretStoreError } from './secret-store-error';

export class SecretBlankError extends SecretStoreError {
  constructor(readonly secretName: string) {
    super(`Secret "${secretName}" is present but empty or whitespace-only`);
    this.name = 'SecretBlankError';
  }
}
