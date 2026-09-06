import type { SecretString } from '@pkgs/secret-string/secret-string';
import { SecretMissingError } from './errors';
import type {
  SecretStore,
  SecretStoreGetInit,
  SecretStoreSetInit,
} from './interface';

/**
 * Composes two stores with precedence: `primary` first, then `fallback`.
 *
 * Writes always go to `primary` — the fallback is intentionally read-only from
 * this class's perspective (e.g. a process-env source that you don't want to
 * mutate). If the primary cannot write, the error from primary propagates.
 */
export class CombinedSecretStore implements SecretStore {
  constructor(
    private readonly primary: SecretStore,
    private readonly fallback: SecretStore
  ) {}

  async getRequired(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString> {
    const value = await this.getOptional(name, init);
    if (value !== null) {
      return value;
    }
    throw new SecretMissingError(name);
  }

  async getOptional(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString | null> {
    const primaryValue = await this.primary.getOptional(name, init);
    if (primaryValue !== null) {
      return primaryValue;
    }
    return this.fallback.getOptional(name, init);
  }

  async getRequiredMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString>> {
    const out: Record<string, SecretString> = {};
    for (const name of names) {
      out[name] = await this.getRequired(name, init);
    }
    return out;
  }

  async getOptionalMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString | null>> {
    if (names.length === 0) return {};
    const primary = await this.primary.getOptionalMany(names, init);
    const missing = names.filter((n) => primary[n] === null);
    if (missing.length === 0) {
      const out: Record<string, SecretString | null> = {};
      for (const name of names) {
        out[name] = primary[name] ?? null;
      }
      return out;
    }
    const fallback = await this.fallback.getOptionalMany(missing, init);
    const out: Record<string, SecretString | null> = {};
    for (const name of names) {
      const p = primary[name];
      out[name] = p !== null && p !== undefined ? p : (fallback[name] ?? null);
    }
    return out;
  }

  setSecret(
    name: string,
    value: string,
    init?: SecretStoreSetInit
  ): Promise<void> {
    return this.primary.setSecret(name, value, init);
  }
}

export function createCombinedSecretStore(
  primary: SecretStore,
  fallback: SecretStore
): SecretStore {
  return new CombinedSecretStore(primary, fallback);
}
