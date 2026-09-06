import { createLogger } from '@pkgs/logger';
import {
  isSecretStoreError,
  SecretStoreRequestError,
} from '@pkgs/secret-store';

import { createCacheApp } from './create-app';
import { loadCacheBootConfig } from '../config/boot-config';
import {
  ConfigurationError,
  readVaultScopeBindings,
  assertVaultToken,
  type CacheServerEnv,
} from '../config/env';
import { createCacheSecretStore } from '../config/secret-store';

const log = createLogger({ name: 'turbo-cache' });

type App = ReturnType<typeof createCacheApp>;

type BootState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'ready'; readonly app: App }
  | { readonly kind: 'fatal'; readonly reason: string };

function isTransientVaultBootError(err: unknown): boolean {
  if (!(err instanceof SecretStoreRequestError)) return false;
  const status = err.status;
  if (status === undefined) return true;
  return status === 429 || status === 530 || (status >= 502 && status <= 504);
}

async function bootApp(env: CacheServerEnv): Promise<App> {
  const token = assertVaultToken(env);
  const { addr, project, config } = readVaultScopeBindings(env);
  const secretStore = createCacheSecretStore(token, { addr, project, config });
  const bootConfig = await loadCacheBootConfig(secretStore);
  return createCacheApp(bootConfig);
}

export class CacheBootManager {
  private bootState: BootState = { kind: 'pending' };
  private fatalLogged = false;

  constructor(private readonly env: CacheServerEnv) {}

  fatalReason(): string | null {
    return this.bootState.kind === 'fatal' ? this.bootState.reason : null;
  }

  private latchFatal(reason: string): void {
    this.bootState = { kind: 'fatal', reason };
    if (!this.fatalLogged) {
      log.error('cache fatal: refusing to serve', { reason });
      this.fatalLogged = true;
    }
  }

  async ensureApp(): Promise<App | null> {
    if (this.bootState.kind === 'ready') return this.bootState.app;
    if (this.bootState.kind === 'fatal') return null;

    try {
      const app = await bootApp(this.env);
      this.bootState = { kind: 'ready', app };
      return app;
    } catch (err: unknown) {
      if (err instanceof ConfigurationError) {
        this.latchFatal(err.message);
        return null;
      }
      if (isTransientVaultBootError(err)) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('cache boot transient vault error; will retry', {
          error: message,
        });
        return null;
      }
      if (isSecretStoreError(err)) {
        this.latchFatal(err instanceof Error ? err.message : String(err));
        return null;
      }
      throw err;
    }
  }
}
