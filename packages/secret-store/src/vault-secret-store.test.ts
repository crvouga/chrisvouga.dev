import { describe, expect, it } from 'bun:test';
import {
  SecretBlankError,
  SecretMissingError,
  SecretStoreParseError,
  SecretStoreRequestError,
} from './errors';
import { VaultSecretStore } from './vault-secret-store';

function mockFetch(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return impl;
}

function kvResponse(data: Record<string, string>): Response {
  return new Response(JSON.stringify({ data: { data } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fetchInputToUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return '';
}

describe('VaultSecretStore', () => {
  const baseOpts = {
    token: 'hvs.test',
    project: 'personal',
    config: 'dev',
  };

  it('throws when token is blank', () => {
    expect(
      () =>
        new VaultSecretStore({
          ...baseOpts,
          token: '',
        })
    ).toThrow(SecretStoreRequestError);
    expect(
      () =>
        new VaultSecretStore({
          ...baseOpts,
          token: '  ',
        })
    ).toThrow(SecretStoreRequestError);
  });

  it('getRequired returns trimmed value', async () => {
    const store = new VaultSecretStore({
      ...baseOpts,
      fetchFn: mockFetch((_input, init) => {
        expect(init?.headers).toMatchObject({
          'X-Vault-Token': 'hvs.test',
        });
        return Promise.resolve(kvResponse({ FOO: '  bar  ' }));
      }),
    });
    const s = await store.getRequired('FOO');
    expect(s.readSecretValue()).toBe('bar');
    expect(s.name).toBe('FOO');
  });

  it('getRequired throws SecretMissingError when key absent', async () => {
    const store = new VaultSecretStore({
      ...baseOpts,
      fetchFn: mockFetch(() => Promise.resolve(kvResponse({}))),
    });
    await expect(store.getRequired('MISSING')).rejects.toBeInstanceOf(
      SecretMissingError
    );
  });

  it('getRequired throws SecretBlankError when key blank', async () => {
    const store = new VaultSecretStore({
      ...baseOpts,
      fetchFn: mockFetch(() => Promise.resolve(kvResponse({ FOO: '  ' }))),
    });
    await expect(store.getRequired('FOO')).rejects.toBeInstanceOf(
      SecretBlankError
    );
  });

  it('getOptional returns null when absent or blank', async () => {
    const store = new VaultSecretStore({
      ...baseOpts,
      fetchFn: mockFetch(() => Promise.resolve(kvResponse({ A: '', B: 'ok' }))),
    });
    await expect(store.getOptional('NONE')).resolves.toBeNull();
    await expect(store.getOptional('A')).resolves.toBeNull();
    const b = await store.getOptional('B');
    expect(b?.readSecretValue()).toBe('ok');
  });

  it('getRequiredMany batches one request', async () => {
    let calls = 0;
    let url = '';
    const store = new VaultSecretStore({
      ...baseOpts,
      fetchFn: mockFetch((input) => {
        calls += 1;
        url = fetchInputToUrl(input);
        return Promise.resolve(kvResponse({ A: '1', B: '2' }));
      }),
    });
    const r = await store.getRequiredMany(['A', 'B']);
    expect(r['A']?.readSecretValue()).toBe('1');
    expect(r['B']?.readSecretValue()).toBe('2');
    expect(calls).toBe(1);
    expect(url).toContain('/v1/secret/data/personal/dev');
  });

  it('throws SecretStoreRequestError on non-OK HTTP', async () => {
    const store = new VaultSecretStore({
      ...baseOpts,
      fetchFn: mockFetch(() =>
        Promise.resolve(new Response('n', { status: 401 }))
      ),
    });
    await expect(store.getRequired('X')).rejects.toBeInstanceOf(
      SecretStoreRequestError
    );
  });

  it('throws SecretStoreParseError on invalid JSON', async () => {
    const store = new VaultSecretStore({
      ...baseOpts,
      fetchFn: mockFetch(() =>
        Promise.resolve(
          new Response('not-json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      ),
    });
    await expect(store.getRequired('X')).rejects.toBeInstanceOf(
      SecretStoreParseError
    );
  });

  it('setSecret rejects with SecretStoreRequestError (HTTP transport is read-only)', async () => {
    const store = new VaultSecretStore(baseOpts);
    await expect(store.setSecret('FOO', 'bar')).rejects.toBeInstanceOf(
      SecretStoreRequestError
    );
  });

  it('getOptionalMany returns null for missing or blank keys', async () => {
    const store = new VaultSecretStore({
      ...baseOpts,
      fetchFn: mockFetch(() =>
        Promise.resolve(kvResponse({ A: 'a', B: '   ' }))
      ),
    });
    const r = await store.getOptionalMany(['A', 'B', 'C']);
    expect(r['A']?.readSecretValue()).toBe('a');
    expect(r['B']).toBeNull();
    expect(r['C']).toBeNull();
  });

  it('retries on HTTP 429 honoring Retry-After', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const store = new VaultSecretStore({
      ...baseOpts,
      rateLimitRetries: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchFn: mockFetch(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve(
            new Response('rate-limited', {
              status: 429,
              headers: { 'Retry-After': '2' },
            })
          );
        }
        return Promise.resolve(kvResponse({ FOO: 'bar' }));
      }),
    });
    const foo = await store.getRequired('FOO');
    expect(foo.readSecretValue()).toBe('bar');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  it('retries on HTTP 530 with fixed backoff', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const store = new VaultSecretStore({
      ...baseOpts,
      rateLimitRetries: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchFn: mockFetch(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve(
            new Response('standby removed', { status: 530 })
          );
        }
        return Promise.resolve(kvResponse({ FOO: 'bar' }));
      }),
    });
    const foo = await store.getRequired('FOO');
    expect(foo.readSecretValue()).toBe('bar');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  it('gives up after rateLimitRetries and surfaces the 429', async () => {
    let calls = 0;
    const store = new VaultSecretStore({
      ...baseOpts,
      rateLimitRetries: 1,
      sleep: async () => {},
      fetchFn: mockFetch(() => {
        calls += 1;
        return Promise.resolve(new Response('rate-limited', { status: 429 }));
      }),
    });
    await expect(store.getRequired('FOO')).rejects.toBeInstanceOf(
      SecretStoreRequestError
    );
    expect(calls).toBe(2);
  });
});
