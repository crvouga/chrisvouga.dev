import { assert, hotAssert, type Assert } from '@pkgs/assert';
import type { SecretString } from '@pkgs/secret-string/secret-string';
import { SecretMissingError } from './errors';
import type {
  SecretStore,
  SecretStoreGetInit,
  SecretStoreSetInit,
} from './interface';
import { wrapSecret, wrapSecretOptional } from './wrap-secret';

export type CachingSecretStoreOptions = {
  /** Time-to-live for successfully resolved values, in ms. */
  ttlMs: number;
  /** @default Date.now */
  now?: () => number;
};

type CacheEntry = { value: string | null; expiresAt: number };

type PendingBatch = {
  readonly names: Set<string>;
  readonly promise: Promise<Record<string, string | null>>;
  readonly signal: AbortSignal | undefined;
};

/**
 * Wraps a {@link SecretStore}: caches successful `getRequired` / `getOptional`
 * results per key until TTL. Thrown errors are never cached.
 *
 * Coalescing — concurrent cache misses fold into a single upstream call:
 *  - **Single-flight per key**: when a fetch for `name` is already in flight,
 *    new misses for the same `name` await the in-flight promise instead of
 *    firing a duplicate request.
 *  - **Microtask batch**: all misses scheduled in the same microtask join one
 *    {@link SecretStore.getOptionalMany} round-trip.
 *
 * This protects against cold-cache request bursts that would otherwise fan
 * out into a Vault 429 storm: a single inbound request loading N secrets
 * sequentially still costs N upstream calls, but M parallel inbound requests
 * each loading the same N secrets cost N (not M*N) calls in steady state and
 * exactly N calls during a cold start.
 *
 * The cache stores raw `string` values internally; results are re-wrapped into
 * {@link SecretString} at the public read boundary so cache hits do not bypass
 * redaction.
 *
 * Pass `{ force: true }` on a read to bypass the cache for one call (the
 * freshly-fetched value is still written back to the cache). This is the
 * escape hatch for self-healing paths — e.g. the Stripe webhook route
 * re-reads the signing secret under `force` after a signature verification
 * failure so a rotated `whsec_…` propagates without restarting the worker.
 */
export class CachingSecretStore implements SecretStore {
  private readonly inner: SecretStore;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<string | null>>();
  private currentBatch: PendingBatch | null = null;

  constructor(inner: SecretStore, options: CachingSecretStoreOptions) {
    assert.defined(inner, 'CachingSecretStore: inner store is required');
    assert.record(options, 'CachingSecretStore: options must be an object');
    assert.nonNegativeInteger(
      options.ttlMs,
      'CachingSecretStore: ttlMs must be a non-negative integer'
    );
    assert.ok(
      options.now === undefined || typeof options.now === 'function',
      'CachingSecretStore: now must be a function when provided'
    );
    this.inner = inner;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
    assert.equals(this.inner, inner, 'CachingSecretStore: inner invariant');
    assert.equals(
      this.ttlMs,
      options.ttlMs,
      'CachingSecretStore: ttlMs invariant'
    );
    assert.defined(this.now, 'CachingSecretStore: now must be set');
  }

  /** Testing: drop all cached entries. */
  clearCacheForTests(): void {
    this.cache.clear();
  }

  private peek(name: string): string | null | undefined {
    assert.nonEmptyString(
      name,
      'CachingSecretStore.peek: name must be non-empty'
    );
    const e = this.cache.get(name);
    if (e === undefined) {
      return undefined;
    }
    assert.record(e, 'CachingSecretStore.peek: cache entry must be an object');
    if (e.expiresAt <= this.now()) {
      this.cache.delete(name);
      return undefined;
    }
    assert.ok(
      e.value === null || typeof e.value === 'string',
      'CachingSecretStore.peek: cached value must be string or null'
    );
    return e.value;
  }

  private put(name: string, value: string | null): void {
    assert.nonEmptyString(
      name,
      'CachingSecretStore.put: name must be non-empty'
    );
    assert.ok(
      value === null || typeof value === 'string',
      'CachingSecretStore.put: value must be string or null'
    );
    const expiresAt = this.now() + this.ttlMs;
    assert.number(
      expiresAt,
      'CachingSecretStore.put: expiresAt must be a number'
    );
    this.cache.set(name, { value, expiresAt });
  }

  /**
   * Returns the open batch (creating one + scheduling a microtask flush when
   * none is open). Subsequent calls in the same tick fold into that batch's
   * `names` set so a single upstream `getOptionalMany` resolves them all.
   */
  private getOrStartBatch(signal: AbortSignal | undefined): PendingBatch {
    assert.ok(
      signal === undefined || signal instanceof AbortSignal,
      'CachingSecretStore.getOrStartBatch: signal must be an AbortSignal when provided'
    );
    if (this.currentBatch !== null) {
      return this.currentBatch;
    }
    let resolveBatch: (v: Record<string, string | null>) => void = () => {};
    let rejectBatch: (e: unknown) => void = () => {};
    const promise = new Promise<Record<string, string | null>>((res, rej) => {
      resolveBatch = res;
      rejectBatch = rej;
    });
    const batch: PendingBatch = { names: new Set(), promise, signal };
    this.currentBatch = batch;
    queueMicrotask(() => {
      if (this.currentBatch === batch) {
        this.currentBatch = null;
      }
      const init: SecretStoreGetInit | undefined =
        signal !== undefined ? { signal } : undefined;
      const names = [...batch.names];
      assert.nonEmptyArray(
        names,
        'CachingSecretStore: batch must hold at least one name'
      );
      this.inner.getOptionalMany(names, init).then((wrapped) => {
        assert.record(
          wrapped,
          'CachingSecretStore: upstream result must be an object'
        );
        const unwrapped: Record<string, string | null> = {};
        const ha: Assert = hotAssert();
        for (const n of names) {
          ha.nonEmptyString(
            n,
            'CachingSecretStore: batch name must be non-empty'
          );
          const v = wrapped[n] ?? null;
          assert.ok(
            v === null || typeof v === 'object',
            'CachingSecretStore: upstream value must be SecretString or null'
          );
          unwrapped[n] = v === null ? null : v.readSecretValue();
        }
        resolveBatch(unwrapped);
      }, rejectBatch);
    });
    return batch;
  }

  /**
   * Single-flight wrapper around the batched upstream fetch. Concurrent
   * callers for the same `name` share the same promise — both within the
   * current microtask batch and across batches still in flight.
   */
  private fetchCoalesced(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<string | null> {
    assert.nonEmptyString(
      name,
      'CachingSecretStore.fetchCoalesced: name must be non-empty'
    );
    const existing = this.inflight.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const batch = this.getOrStartBatch(init?.signal);
    batch.names.add(name);
    const inflight = batch.promise.then(
      (result) => {
        assert.record(
          result,
          'CachingSecretStore: batch result must be an object'
        );
        this.inflight.delete(name);
        const value = result[name] ?? null;
        assert.ok(
          value === null || typeof value === 'string',
          'CachingSecretStore: batch value must be string or null'
        );
        this.put(name, value);
        return value;
      },
      (err: unknown) => {
        this.inflight.delete(name);
        throw err;
      }
    );
    this.inflight.set(name, inflight);
    return inflight;
  }

  async getRequired(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString> {
    assert.nonEmptyString(
      name,
      'CachingSecretStore.getRequired: name must be non-empty'
    );
    if (init?.force !== true) {
      const p = this.peek(name);
      if (p !== null && p !== undefined) {
        return wrapSecret(name, p);
      }
      if (p === null) {
        this.cache.delete(name);
      }
    } else {
      this.cache.delete(name);
    }
    const value = await this.fetchCoalesced(name, init);
    if (value === null) {
      throw new SecretMissingError(name);
    }
    assert.string(
      value,
      'CachingSecretStore.getRequired: value must be a string here'
    );
    return wrapSecret(name, value);
  }

  async getOptional(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString | null> {
    assert.nonEmptyString(
      name,
      'CachingSecretStore.getOptional: name must be non-empty'
    );
    if (init?.force !== true) {
      const p = this.peek(name);
      if (p !== undefined) {
        return wrapSecretOptional(name, p);
      }
    } else {
      this.cache.delete(name);
    }
    const value = await this.fetchCoalesced(name, init);
    return wrapSecretOptional(name, value);
  }

  async getRequiredMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString>> {
    assert.array(
      names,
      'CachingSecretStore.getRequiredMany: names must be an array'
    );
    if (names.length === 0) {
      return {};
    }
    const haRequired: Assert = hotAssert();
    for (const n of names) {
      haRequired.nonEmptyString(
        n,
        'CachingSecretStore.getRequiredMany: name must be non-empty'
      );
    }
    const out: Record<string, SecretString> = {};
    await Promise.all(
      names.map(async (name) => {
        out[name] = await this.getRequired(name, init);
      })
    );
    assert.equals(
      Object.keys(out).length,
      names.length,
      'CachingSecretStore.getRequiredMany: one entry per name'
    );
    return out;
  }

  async getOptionalMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString | null>> {
    assert.array(
      names,
      'CachingSecretStore.getOptionalMany: names must be an array'
    );
    if (names.length === 0) {
      return {};
    }
    const haOptional: Assert = hotAssert();
    for (const n of names) {
      haOptional.nonEmptyString(
        n,
        'CachingSecretStore.getOptionalMany: name must be non-empty'
      );
    }
    const out: Record<string, SecretString | null> = {};
    await Promise.all(
      names.map(async (name) => {
        out[name] = await this.getOptional(name, init);
      })
    );
    assert.equals(
      Object.keys(out).length,
      names.length,
      'CachingSecretStore.getOptionalMany: one entry per name'
    );
    return out;
  }

  /**
   * Forwards to the inner store, then invalidates the cached read for `name`
   * on success so the next read observes the just-written value.
   */
  async setSecret(
    name: string,
    value: string,
    init?: SecretStoreSetInit
  ): Promise<void> {
    assert.nonEmptyString(
      name,
      'CachingSecretStore.setSecret: name must be non-empty'
    );
    assert.string(
      value,
      'CachingSecretStore.setSecret: value must be a string'
    );
    await this.inner.setSecret(name, value, init);
    this.cache.delete(name);
  }
}

export function createCachingSecretStore(
  inner: SecretStore,
  options: CachingSecretStoreOptions
): SecretStore {
  assert.defined(inner, 'createCachingSecretStore: inner store is required');
  assert.record(options, 'createCachingSecretStore: options must be an object');
  const store = new CachingSecretStore(inner, options);
  assert.ok(
    store instanceof CachingSecretStore,
    'createCachingSecretStore: must return CachingSecretStore'
  );
  return store;
}
