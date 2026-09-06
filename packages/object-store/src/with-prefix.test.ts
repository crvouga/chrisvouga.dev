import { beforeEach, describe, expect, test } from 'bun:test';
import { ObjectStoreImplInMemory } from './impl-in-memory';
import {
  normalizeObjectStorePrefix,
  ObjectStoreWithPrefix,
} from './impl-with-prefix';
import type { ObjectStore } from './interface';

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

describe('normalizeObjectStorePrefix', () => {
  test('appends trailing slash when missing', () => {
    expect(normalizeObjectStorePrefix('tts-audio')).toBe('tts-audio/');
  });

  test('preserves trailing slash', () => {
    expect(normalizeObjectStorePrefix('tts-audio/')).toBe('tts-audio/');
  });

  test('rejects empty prefix', () => {
    expect(() => normalizeObjectStorePrefix('')).toThrow(/non-empty/);
  });
});

describe('ObjectStoreWithPrefix', () => {
  let root: ObjectStoreImplInMemory;
  let scoped: ObjectStore;

  beforeEach(() => {
    root = new ObjectStoreImplInMemory();
    scoped = root.withPrefix('tts-audio/');
  });

  test('round-trips bytes through the scoped view', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await scoped.put('k', bytes, 'text/plain');
    const result = await scoped.get('k');
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(await readAllBytes(result.body)).toEqual(bytes);
  });

  test('write isolation: root does not see unprefixed key', async () => {
    await scoped.put('k', new Uint8Array([1]), 'text/plain');
    expect(await root.head('k')).toBe(false);
    expect(await root.head('tts-audio/k')).toBe(true);
  });

  test('read isolation: root writes are invisible to scoped view', async () => {
    await root.put('other', new Uint8Array([9]), 'text/plain');
    expect(await scoped.head('other')).toBe(false);
  });

  test('delete isolation: scoped delete removes only prefixed key', async () => {
    await scoped.put('k', new Uint8Array([1]), 'text/plain');
    await root.put('other-prefix/k', new Uint8Array([2]), 'text/plain');
    await scoped.delete('k');
    expect(await scoped.head('k')).toBe(false);
    expect(await root.head('tts-audio/k')).toBe(false);
    expect(await root.head('other-prefix/k')).toBe(true);
  });

  test('nested withPrefix composes against the root store', async () => {
    const nested = root.withPrefix('a/').withPrefix('b/');
    await nested.put('k', new Uint8Array([5]), 'text/plain');
    expect(await root.head('a/b/k')).toBe(true);
    expect(await root.head('a/k')).toBe(false);
    expect(await nested.head('k')).toBe(true);
  });

  test('getUri delegates with prefix', async () => {
    await scoped.put(
      'k',
      new Uint8Array([1, 2, 3]),
      'application/octet-stream'
    );
    const scopedUri = await scoped.getUri('k');
    const rootUnprefixed = await root.getUri('k');
    const rootPrefixed = await root.getUri('tts-audio/k');
    expect(rootUnprefixed).toBeNull();
    if (
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      typeof Blob !== 'undefined'
    ) {
      expect(typeof scopedUri).toBe('string');
      expect((scopedUri ?? '').length).toBeGreaterThan(0);
      expect(typeof rootPrefixed).toBe('string');
      expect((rootPrefixed ?? '').length).toBeGreaterThan(0);
    } else {
      expect(scopedUri).toBeNull();
      expect(rootPrefixed).toBeNull();
    }
  });

  test('withPrefix on wrapper returns ObjectStoreWithPrefix over same inner', async () => {
    const direct = new ObjectStoreWithPrefix(root, 'x/');
    const viaMethod = root.withPrefix('x/');
    await direct.put('k', new Uint8Array([1]), 'text/plain');
    expect(await viaMethod.head('k')).toBe(true);
    expect(await root.head('x/k')).toBe(true);
  });
});
