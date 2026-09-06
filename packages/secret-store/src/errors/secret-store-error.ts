/** Base for all secret-store failures (Tiger Style: typed, loud). */
export class SecretStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreError';
  }
}
