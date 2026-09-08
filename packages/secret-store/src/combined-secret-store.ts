import { assert, hotAssert, type Assert } from '@pkgs/assert';
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
  ) {
    assert.defined(primary, 'CombinedSecretStore: primary store is required');
    assert.defined(fallback, 'CombinedSecretStore: fallback store is required');
    assert.equals(
      this.primary,
      primary,
      'CombinedSecretStore: primary invariant'
    );
    assert.equals(
      this.fallback,
      fallback,
      'CombinedSecretStore: fallback invariant'
    );
  }

  async getRequired(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString> {
    assert.nonEmptyString(
      name,
      'CombinedSecretStore.getRequired: name must be non-empty'
    );
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
    assert.nonEmptyString(
      name,
      'CombinedSecretStore.getOptional: name must be non-empty'
    );
    const primaryValue = await this.primary.getOptional(name, init);
    assert.ok(
      primaryValue === null || typeof primaryValue === 'object',
      'CombinedSecretStore.getOptional: primary must return SecretString or null'
    );
    if (primaryValue !== null) {
      return primaryValue;
    }
    const fallbackValue = await this.fallback.getOptional(name, init);
    assert.ok(
      fallbackValue === null || typeof fallbackValue === 'object',
      'CombinedSecretStore.getOptional: fallback must return SecretString or null'
    );
    return fallbackValue;
  }

  async getRequiredMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString>> {
    assert.array(
      names,
      'CombinedSecretStore.getRequiredMany: names must be an array'
    );
    this.assertManyNames(names, 'CombinedSecretStore.getRequiredMany');
    const out: Record<string, SecretString> = {};
    for (const name of names) {
      out[name] = await this.getRequired(name, init);
    }
    assert.equals(
      Object.keys(out).length,
      names.length,
      'CombinedSecretStore.getRequiredMany: one entry per name'
    );
    return out;
  }

  async getOptionalMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString | null>> {
    assert.array(
      names,
      'CombinedSecretStore.getOptionalMany: names must be an array'
    );
    if (names.length === 0) return {};
    this.assertManyNames(names, 'CombinedSecretStore.getOptionalMany');
    const primary = await this.primary.getOptionalMany(names, init);
    assert.record(
      primary,
      'CombinedSecretStore.getOptionalMany: primary result must be an object'
    );
    const missing = names.filter((n) => primary[n] === null);
    if (missing.length === 0) {
      return this.completeFromPrimary(names, primary);
    }
    const fallback = await this.fallback.getOptionalMany(missing, init);
    assert.record(
      fallback,
      'CombinedSecretStore.getOptionalMany: fallback result must be an object'
    );
    return this.mergePrimaryFallback(names, primary, fallback);
  }

  /** Hot per-key name check shared by the `*Many` batch reads. */
  private assertManyNames(names: readonly string[], context: string): void {
    const ha: Assert = hotAssert();
    for (const name of names) {
      ha.nonEmptyString(name, `${context}: name must be non-empty`);
    }
  }

  /** Fast path: every name resolved from `primary`, no fallback round-trip. */
  private completeFromPrimary(
    names: readonly string[],
    primary: Record<string, SecretString | null>
  ): Record<string, SecretString | null> {
    const out: Record<string, SecretString | null> = {};
    for (const name of names) {
      const v = primary[name] ?? null;
      assert.ok(
        v === null || typeof v === 'object',
        'CombinedSecretStore.getOptionalMany: value must be SecretString or null'
      );
      out[name] = v;
    }
    return out;
  }

  /** Merge primary hits with fallback values for the primary misses. */
  private mergePrimaryFallback(
    names: readonly string[],
    primary: Record<string, SecretString | null>,
    fallback: Record<string, SecretString | null>
  ): Record<string, SecretString | null> {
    const out: Record<string, SecretString | null> = {};
    for (const name of names) {
      const p = primary[name];
      assert.ok(
        p === null || p === undefined || typeof p === 'object',
        'CombinedSecretStore.getOptionalMany: primary value must be SecretString, null, or undefined'
      );
      const f = fallback[name] ?? null;
      if (p !== null && p !== undefined) {
        out[name] = p;
      } else {
        out[name] = f;
      }
    }
    assert.equals(
      Object.keys(out).length,
      names.length,
      'CombinedSecretStore.getOptionalMany: one entry per name'
    );
    return out;
  }

  setSecret(
    name: string,
    value: string,
    init?: SecretStoreSetInit
  ): Promise<void> {
    assert.nonEmptyString(
      name,
      'CombinedSecretStore.setSecret: name must be non-empty'
    );
    assert.string(
      value,
      'CombinedSecretStore.setSecret: value must be a string'
    );
    return this.primary.setSecret(name, value, init);
  }
}

export function createCombinedSecretStore(
  primary: SecretStore,
  fallback: SecretStore
): SecretStore {
  assert.defined(
    primary,
    'createCombinedSecretStore: primary store is required'
  );
  assert.defined(
    fallback,
    'createCombinedSecretStore: fallback store is required'
  );
  const store = new CombinedSecretStore(primary, fallback);
  assert.ok(
    store instanceof CombinedSecretStore,
    'createCombinedSecretStore: must return CombinedSecretStore'
  );
  return store;
}
