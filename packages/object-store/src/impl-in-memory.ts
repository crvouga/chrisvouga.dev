import { assert } from '@pkgs/assert';
import type { ObjectStore, StoredObject } from './interface';
import { ObjectStoreWithPrefix } from './impl-with-prefix';

type Entry = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
};

/**
 * In-process {@link ObjectStore} backed by a `Map`. Used by the conformance
 * suite in `interface.test.ts` and by feature unit tests that want to exercise
 * cache-then-generate flows without S3 / network.
 *
 * `put` defensively copies the input bytes so callers can reuse their buffer;
 * `get` returns a fresh `ReadableStream` per call so multiple readers don't
 * race over a single-use stream.
 */
export class ObjectStoreImplInMemory implements ObjectStore {
  private readonly store = new Map<string, Entry>();

  get(key: string): Promise<StoredObject | null> {
    assert.string(key, 'ObjectStoreImplInMemory.get: key must be a string');
    const entry = this.store.get(key);
    if (entry === undefined) return Promise.resolve(null);
    assert.instanceOf(
      entry.bytes,
      Uint8Array,
      'ObjectStoreImplInMemory.get: bytes invariant'
    );
    assert.nonEmptyString(
      entry.contentType,
      'ObjectStoreImplInMemory.get: contentType invariant'
    );
    const bytesCopy = new Uint8Array(entry.bytes);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytesCopy);
        controller.close();
      },
    });
    return Promise.resolve({
      body: stream,
      contentType: entry.contentType,
      size: entry.bytes.byteLength,
    });
  }

  put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    assert.string(key, 'ObjectStoreImplInMemory.put: key must be a string');
    assert.instanceOf(
      bytes,
      Uint8Array,
      'ObjectStoreImplInMemory.put: bytes must be a Uint8Array'
    );
    assert.nonEmptyString(
      contentType,
      'ObjectStoreImplInMemory.put: contentType must be non-empty'
    );
    this.store.set(key, { bytes: new Uint8Array(bytes), contentType });
    return Promise.resolve();
  }

  head(key: string): Promise<boolean> {
    assert.string(key, 'ObjectStoreImplInMemory.head: key must be a string');
    return Promise.resolve(this.store.has(key));
  }

  delete(key: string): Promise<void> {
    assert.string(key, 'ObjectStoreImplInMemory.delete: key must be a string');
    this.store.delete(key);
    return Promise.resolve();
  }

  /**
   * Materialises a `blob:` URL for the entry when the runtime supports
   * `URL.createObjectURL` (browsers, Bun, JSDOM); returns `null` everywhere
   * else (Workers, plain Node) and for missing keys. Callers that need a
   * playable URL on those runtimes should fall back to {@link get} + manual
   * conversion.
   */
  getUri(key: string): Promise<string | null> {
    assert.string(key, 'ObjectStoreImplInMemory.getUri: key must be a string');
    const entry = this.store.get(key);
    if (entry === undefined) return Promise.resolve(null);
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function')
      return Promise.resolve(null);
    if (typeof Blob === 'undefined') return Promise.resolve(null);
    const ab = new ArrayBuffer(entry.bytes.byteLength);
    assert.nonNegativeInteger(
      ab.byteLength,
      'ObjectStoreImplInMemory.getUri: buffer size invariant'
    );
    new Uint8Array(ab).set(entry.bytes);
    const blob = new Blob([ab], { type: entry.contentType });
    const uri = URL.createObjectURL(blob);
    assert.nonEmptyString(
      uri,
      'ObjectStoreImplInMemory.getUri: uri must be non-empty'
    );
    return Promise.resolve(uri);
  }

  withPrefix(prefix: string): ObjectStore {
    assert.string(
      prefix,
      'ObjectStoreImplInMemory.withPrefix: prefix must be a string'
    );
    const out = new ObjectStoreWithPrefix(this, prefix);
    assert.ok(
      out instanceof ObjectStoreWithPrefix,
      'ObjectStoreImplInMemory.withPrefix: must return ObjectStoreWithPrefix'
    );
    return out;
  }
}
