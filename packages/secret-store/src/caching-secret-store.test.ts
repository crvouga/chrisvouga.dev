import { describe, expect, it } from 'bun:test';
import { CachingSecretStore } from './caching-secret-store';
import { SecretMissingError } from './errors';
import type { SecretStore } from './interface';
import { wrapSecret, wrapSecretOptional } from './wrap-secret';

type CountingStore = SecretStore & {
  readonly counts: { g: number; o: number; m: number; om: number; s: number };
  readonly omCalls: ReadonlyArray<readonly string[]>;
  readonly writes: ReadonlyArray<{
    readonly name: string;
    readonly value: string;
  }>;
};

function createCountingStore(
  values: Record<string, string | null> = {}
): CountingStore {
  const counts = { g: 0, o: 0, m: 0, om: 0, s: 0 };
  const writes: { name: string; value: string }[] = [];
  const omCalls: string[][] = [];
  const valueOf = (n: string): string | null => {
    if (n in values) return values[n] as string | null;
    if (n === 'nil') return null;
    return `${n}-v`;
  };
  return {
    counts,
    omCalls,
    writes,
    async getRequired(name: string) {
      counts.g += 1;
      const v = valueOf(name);
      if (v === null) throw new SecretMissingError(name);
      return wrapSecret(name, v);
    },
    async getOptional(name: string) {
      counts.o += 1;
      return wrapSecretOptional(name, valueOf(name));
    },
    async getRequiredMany(names: readonly string[]) {
      counts.m += 1;
      const out: Record<string, ReturnType<typeof wrapSecret>> = {};
      for (const n of names) {
        const v = valueOf(n);
        if (v === null) throw new SecretMissingError(n);
        out[n] = wrapSecret(n, v);
      }
      return out;
    },
    async getOptionalMany(names: readonly string[]) {
      counts.om += 1;
      omCalls.push([...names]);
      const out: Record<string, ReturnType<typeof wrapSecretOptional>> = {};
      for (const n of names) {
        out[n] = wrapSecretOptional(n, valueOf(n));
      }
      return out;
    },
    async setSecret(name: string, value: string) {
      counts.s += 1;
      writes.push({ name, value });
    },
  };
}

describe('CachingSecretStore', () => {
  it('caches getRequired until TTL', async () => {
    let t = 0;
    const inner = createCountingStore();
    const cache = new CachingSecretStore(inner, { ttlMs: 1000, now: () => t });

    expect((await cache.getRequired('A')).readSecretValue()).toBe('A-v');
    expect((await cache.getRequired('A')).readSecretValue()).toBe('A-v');
    expect(inner.counts.om).toBe(1);

    t += 1001;
    expect((await cache.getRequired('A')).readSecretValue()).toBe('A-v');
    expect(inner.counts.om).toBe(2);
  });

  it('caches getOptional including null', async () => {
    const t = 0;
    const inner = createCountingStore();
    const cache = new CachingSecretStore(inner, { ttlMs: 1000, now: () => t });

    await expect(cache.getOptional('nil')).resolves.toBeNull();
    await expect(cache.getOptional('nil')).resolves.toBeNull();
    expect(inner.counts.om).toBe(1);
  });

  it('getRequiredMany uses cache for hits', async () => {
    const t = 0;
    const inner = createCountingStore();
    const cache = new CachingSecretStore(inner, { ttlMs: 1000, now: () => t });

    await cache.getRequired('A');
    await cache.getRequiredMany(['A', 'B']);
    expect(inner.counts.om).toBe(2);
    expect(inner.omCalls.map((c) => [...c].sort())).toEqual([['A'], ['B']]);
  });

  it('coalesces concurrent misses for the same key into one upstream call', async () => {
    const inner = createCountingStore();
    const cache = new CachingSecretStore(inner, { ttlMs: 1000 });

    const results = await Promise.all([
      cache.getRequired('A'),
      cache.getRequired('A'),
      cache.getRequired('A'),
    ]);
    expect(results.map((s) => s.readSecretValue())).toEqual([
      'A-v',
      'A-v',
      'A-v',
    ]);
    expect(inner.counts.om).toBe(1);
  });

  it('coalesces concurrent misses for different keys into one batched call', async () => {
    const inner = createCountingStore();
    const cache = new CachingSecretStore(inner, { ttlMs: 1000 });

    const [a, b, c] = await Promise.all([
      cache.getRequired('A'),
      cache.getOptional('B'),
      cache.getRequired('C'),
    ]);
    expect(a.readSecretValue()).toBe('A-v');
    expect(b?.readSecretValue()).toBe('B-v');
    expect(c.readSecretValue()).toBe('C-v');
    expect(inner.counts.om).toBe(1);
    expect(inner.omCalls).toHaveLength(1);
    expect([...(inner.omCalls[0] ?? [])].sort()).toEqual(['A', 'B', 'C']);
  });

  it('throws SecretMissingError when getRequired hits a missing key', async () => {
    const inner = createCountingStore({ X: null });
    const cache = new CachingSecretStore(inner, { ttlMs: 1000 });
    await expect(cache.getRequired('X')).rejects.toBeInstanceOf(
      SecretMissingError
    );
  });

  it('setSecret forwards to inner and invalidates the read cache', async () => {
    const t = 0;
    const inner = createCountingStore();
    const cache = new CachingSecretStore(inner, { ttlMs: 1000, now: () => t });

    await cache.getRequired('A');
    expect(inner.counts.om).toBe(1);

    await cache.setSecret('A', 'new-value');
    expect(inner.counts.s).toBe(1);
    expect(inner.writes).toEqual([{ name: 'A', value: 'new-value' }]);

    await cache.getRequired('A');
    expect(inner.counts.om).toBe(2);
  });

  it('force=true bypasses cache and refreshes the stored value', async () => {
    let t = 0;
    let current: string | null = 'old-v';
    const counts = { om: 0 };
    const inner: SecretStore = {
      async getRequired(name: string) {
        return wrapSecret(name, current ?? '');
      },
      async getOptional(name: string) {
        return wrapSecretOptional(name, current);
      },
      async getRequiredMany() {
        return {};
      },
      async getOptionalMany(names: readonly string[]) {
        counts.om += 1;
        const out: Record<string, ReturnType<typeof wrapSecretOptional>> = {};
        for (const n of names) {
          out[n] = wrapSecretOptional(n, current);
        }
        return out;
      },
      async setSecret() {},
    };
    const cache = new CachingSecretStore(inner, {
      ttlMs: 60_000,
      now: () => t,
    });

    expect((await cache.getRequired('A')).readSecretValue()).toBe('old-v');
    expect((await cache.getRequired('A')).readSecretValue()).toBe('old-v');
    expect(counts.om).toBe(1);

    current = 'new-v';

    expect((await cache.getRequired('A')).readSecretValue()).toBe('old-v');
    expect(counts.om).toBe(1);

    expect(
      (await cache.getRequired('A', { force: true })).readSecretValue()
    ).toBe('new-v');
    expect(counts.om).toBe(2);

    expect((await cache.getRequired('A')).readSecretValue()).toBe('new-v');
    expect(counts.om).toBe(2);

    t += 60_001;
    expect((await cache.getRequired('A')).readSecretValue()).toBe('new-v');
    expect(counts.om).toBe(3);
  });

  it('force=true on getOptional refreshes a cached-null entry', async () => {
    let current: string | null = null;
    const counts = { om: 0 };
    const inner: SecretStore = {
      async getRequired(name: string) {
        return wrapSecret(name, current ?? '');
      },
      async getOptional(name: string) {
        return wrapSecretOptional(name, current);
      },
      async getRequiredMany() {
        return {};
      },
      async getOptionalMany(names: readonly string[]) {
        counts.om += 1;
        const out: Record<string, ReturnType<typeof wrapSecretOptional>> = {};
        for (const n of names) {
          out[n] = wrapSecretOptional(n, current);
        }
        return out;
      },
      async setSecret() {},
    };
    const cache = new CachingSecretStore(inner, { ttlMs: 60_000 });

    expect(await cache.getOptional('A')).toBeNull();
    expect(await cache.getOptional('A')).toBeNull();
    expect(counts.om).toBe(1);

    current = 'rotated';

    expect(await cache.getOptional('A')).toBeNull();
    expect(counts.om).toBe(1);

    const refreshed = await cache.getOptional('A', { force: true });
    expect(refreshed?.readSecretValue()).toBe('rotated');
    expect(counts.om).toBe(2);

    const cached = await cache.getOptional('A');
    expect(cached?.readSecretValue()).toBe('rotated');
    expect(counts.om).toBe(2);
  });

  it('does not cache transport failures (next call retries)', async () => {
    let calls = 0;
    const inner: SecretStore = {
      async getRequired(name: string) {
        return wrapSecret(name, name);
      },
      async getOptional(name: string) {
        return wrapSecret(name, name);
      },
      async getRequiredMany() {
        return {};
      },
      async getOptionalMany() {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return { A: wrapSecret('A', 'A-v') };
      },
      async setSecret() {},
    };
    const cache = new CachingSecretStore(inner, { ttlMs: 1000 });
    await expect(cache.getRequired('A')).rejects.toThrow('boom');
    expect((await cache.getRequired('A')).readSecretValue()).toBe('A-v');
    expect(calls).toBe(2);
  });
});
