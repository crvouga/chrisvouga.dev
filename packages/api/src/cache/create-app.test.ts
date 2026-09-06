import { beforeEach, describe, expect, test } from 'bun:test';
import { ObjectStoreImplInMemory } from '@pkgs/object-store/impl-in-memory';

import { createCacheApp } from './create-app';

const TOKEN = 'test-token';

describe('createCacheApp', () => {
  let app: ReturnType<typeof createCacheApp>;

  beforeEach(() => {
    app = createCacheApp({
      turboToken: TOKEN,
      objectStore: new ObjectStoreImplInMemory(),
    });
  });

  test('GET /health is public', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('GET /v8/artifacts/status requires auth', async () => {
    const res = await app.request('/v8/artifacts/status');
    expect(res.status).toBe(401);
  });

  test('GET /v8/artifacts/status returns enabled with auth', async () => {
    const res = await app.request('/v8/artifacts/status', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'enabled' });
  });

  test('PUT then GET round-trips artifact bytes and tag', async () => {
    const hash = 'abc123';
    const bytes = new Uint8Array([1, 2, 3]);
    const put = await app.request(`/v8/artifacts/${hash}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'x-artifact-tag': 'team:foo',
      },
      body: bytes,
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ urls: [] });

    const head = await app.request(`/v8/artifacts/${hash}`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(head.status).toBe(200);

    const get = await app.request(`/v8/artifacts/${hash}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(get.status).toBe(200);
    expect(get.headers.get('x-artifact-tag')).toBe('team:foo');
    const body = new Uint8Array(await get.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3]);
  });

  test('POST /v8/artifacts reports existence map', async () => {
    const hash = 'exists-me';
    await app.request(`/v8/artifacts/${hash}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: new Uint8Array([9]),
    });

    const res = await app.request('/v8/artifacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([hash, 'missing']),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ [hash]: true, missing: false });
  });
});
