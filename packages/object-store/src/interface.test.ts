import { beforeEach, describe, expect, test } from 'bun:test';
import { ObjectStoreImplInMemory } from './impl-in-memory';
import type { ObjectStore } from './interface';

type Factory = { name: string; create: () => ObjectStore };

const implementations: Factory[] = [
  {
    name: 'ObjectStoreImplInMemory',
    create: () => new ObjectStoreImplInMemory(),
  },
  {
    name: 'ObjectStoreImplInMemory (withPrefix test/)',
    create: () => new ObjectStoreImplInMemory().withPrefix('test/'),
  },
];

async function readAllBytes(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

describe.each(implementations)('ObjectStore — $name', ({ create }) => {
  let store: ObjectStore;

  beforeEach(() => {
    store = create();
  });

  test('get returns null for missing key', async () => {
    const result = await store.get('missing');
    expect(result).toBeNull();
  });

  test('head returns false for missing key', async () => {
    const exists = await store.head('missing');
    expect(exists).toBe(false);
  });

  test('put then get round-trips bytes and contentType', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await store.put('k', bytes, 'application/octet-stream');
    const result = await store.get('k');
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.contentType).toBe('application/octet-stream');
    expect(result.size).toBe(5);
    const read = await readAllBytes(result.body);
    expect(Array.from(read)).toEqual([1, 2, 3, 4, 5]);
  });

  test('head returns true after put', async () => {
    await store.put('k', new Uint8Array([1]), 'text/plain');
    expect(await store.head('k')).toBe(true);
  });

  test('put is idempotent and overwrites', async () => {
    await store.put('k', new Uint8Array([1]), 'text/plain');
    await store.put('k', new Uint8Array([9, 9]), 'application/json');
    const result = await store.get('k');
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.contentType).toBe('application/json');
    expect(result.size).toBe(2);
    const read = await readAllBytes(result.body);
    expect(Array.from(read)).toEqual([9, 9]);
  });

  test('delete removes the key', async () => {
    await store.put('k', new Uint8Array([1]), 'text/plain');
    expect(await store.head('k')).toBe(true);
    await store.delete('k');
    expect(await store.head('k')).toBe(false);
    expect(await store.get('k')).toBeNull();
  });

  test('delete on missing key is a no-op', async () => {
    await expect(store.delete('missing')).resolves.toBeUndefined();
  });

  test('two independent get calls each yield the full body', async () => {
    await store.put('k', new Uint8Array([7, 7, 7]), 'text/plain');
    const a = await store.get('k');
    const b = await store.get('k');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    if (a === null || b === null) return;
    const aBytes = await readAllBytes(a.body);
    const bBytes = await readAllBytes(b.body);
    expect(Array.from(aBytes)).toEqual([7, 7, 7]);
    expect(Array.from(bBytes)).toEqual([7, 7, 7]);
  });

  test('keys are independent', async () => {
    await store.put('a', new Uint8Array([1]), 'text/plain');
    await store.put('b', new Uint8Array([2]), 'text/plain');
    await store.delete('a');
    expect(await store.head('a')).toBe(false);
    expect(await store.head('b')).toBe(true);
  });

  test('getUri returns null for missing key', async () => {
    expect(await store.getUri('missing')).toBeNull();
  });

  test('getUri returns a non-empty string after put when blob URLs are supported', async () => {
    await store.put('k', new Uint8Array([1, 2, 3]), 'application/octet-stream');
    const uri = await store.getUri('k');
    if (
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      typeof Blob !== 'undefined'
    ) {
      expect(typeof uri).toBe('string');
      expect((uri ?? '').length).toBeGreaterThan(0);
    } else {
      expect(uri).toBeNull();
    }
  });
});
