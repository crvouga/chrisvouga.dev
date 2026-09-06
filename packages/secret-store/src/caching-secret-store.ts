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
    this.inner = inner;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  /** Testing: drop all cached entries. */
  clearCacheForTests(): void {
    this.cache.clear();
  }

  private peek(name: string): string | null | undefined {
    const e = this.cache.get(name);
    if (e === undefined) {
      return undefined;
    }
    if (e.expiresAt <= this.now()) {
      this.cache.delete(name);
      return undefined;
    }
    return e.value;
  }

  private put(name: string, value: string | null): void {
    this.cache.set(name, { value, expiresAt: this.now() + this.ttlMs });
  }

  /**
   * Returns the open batch (creating one + scheduling a microtask flush when
   * none is open). Subsequent calls in the same tick fold into that batch's
   * `names` set so a single upstream `getOptionalMany` resolves them all.
   */
  private getOrStartBatch(signal: AbortSignal | undefined): PendingBatch {
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
      this.inner.getOptionalMany(names, init).then((wrapped) => {
        const unwrapped: Record<string, string | null> = {};
        for (const n of names) {
          const v = wrapped[n] ?? null;
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
    const existing = this.inflight.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const batch = this.getOrStartBatch(init?.signal);
    batch.names.add(name);
    const inflight = batch.promise.then(
      (result) => {
        this.inflight.delete(name);
        const value = result[name] ?? null;
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
    return wrapSecret(name, value);
  }

  async getOptional(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString | null> {
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
    if (names.length === 0) {
      return {};
    }
    const out: Record<string, SecretString> = {};
    await Promise.all(
      names.map(async (name) => {
        out[name] = await this.getRequired(name, init);
      })
    );
    return out;
  }

  async getOptionalMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString | null>> {
    if (names.length === 0) {
      return {};
    }
    const out: Record<string, SecretString | null> = {};
    await Promise.all(
      names.map(async (name) => {
        out[name] = await this.getOptional(name, init);
      })
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
    await this.inner.setSecret(name, value, init);
    this.cache.delete(name);
  }
}

export function createCachingSecretStore(
  inner: SecretStore,
  options: CachingSecretStoreOptions
): SecretStore {
  return new CachingSecretStore(inner, options);
}
