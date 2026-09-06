import { SecretStoreError } from './secret-store-error';

export class SecretMissingError extends SecretStoreError {
  constructor(readonly secretName: string) {
    super(`Secret "${secretName}" is missing from the secret store`);
    this.name = 'SecretMissingError';
  }
}
