import type { SecretStore } from '@pkgs/secret-store';
import { createCachingSecretStore, VaultSecretStore } from '@pkgs/secret-store';

const DEFAULT_VAULT_ADDR = 'https://vault.chrisvouga.dev';
const DEFAULT_VAULT_MOUNT = 'secret';
const DEFAULT_VAULT_PROJECT = 'personal';
const DEFAULT_VAULT_CONFIG = 'dev';

export type CreateCacheSecretStoreOptions = {
  readonly addr?: string | null;
  readonly mount?: string | null;
  readonly project?: string | null;
  readonly config?: string | null;
};

export function createCacheSecretStore(
  token: string,
  options: CreateCacheSecretStoreOptions = {}
): SecretStore {
  const addr = options.addr ?? DEFAULT_VAULT_ADDR;
  const mount = options.mount ?? DEFAULT_VAULT_MOUNT;
  const project = options.project ?? DEFAULT_VAULT_PROJECT;
  const config = options.config ?? DEFAULT_VAULT_CONFIG;
  const store = new VaultSecretStore({
    token,
    addr,
    mount,
    project,
    config,
  });
  return createCachingSecretStore(store, { ttlMs: 300_000 });
}
