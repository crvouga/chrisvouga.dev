import { SecretStoreError } from './secret-store-error';

export class SecretStoreParseError extends SecretStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreParseError';
  }
}
