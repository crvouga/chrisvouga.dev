import { SecretStoreError } from './secret-store-error';

export class SecretStoreRequestError extends SecretStoreError {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'SecretStoreRequestError';
  }
}
