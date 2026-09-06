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
    const entry = this.store.get(key);
    if (entry === undefined) return Promise.resolve(null);
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
    this.store.set(key, { bytes: new Uint8Array(bytes), contentType });
    return Promise.resolve();
  }

  head(key: string): Promise<boolean> {
    return Promise.resolve(this.store.has(key));
  }

  delete(key: string): Promise<void> {
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
    const entry = this.store.get(key);
    if (entry === undefined) return Promise.resolve(null);
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function')
      return Promise.resolve(null);
    if (typeof Blob === 'undefined') return Promise.resolve(null);
    const ab = new ArrayBuffer(entry.bytes.byteLength);
    new Uint8Array(ab).set(entry.bytes);
    const blob = new Blob([ab], { type: entry.contentType });
    return Promise.resolve(URL.createObjectURL(blob));
  }

  withPrefix(prefix: string): ObjectStore {
    return new ObjectStoreWithPrefix(this, prefix);
  }
}
