import type { ObjectStore, StoredObject } from './interface';

export function normalizeObjectStorePrefix(prefix: string): string {
  if (prefix.length === 0) {
    throw new Error('ObjectStoreWithPrefix: prefix must be non-empty');
  }
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function joinObjectStorePrefixes(left: string, right: string): string {
  return normalizeObjectStorePrefix(
    `${left}${normalizeObjectStorePrefix(right)}`
  );
}

/**
 * Decorator that scopes every {@link ObjectStore} operation to a fixed key
 * prefix. Used at composition roots (e.g. API bindings) so feature code uses
 * logical keys while a shared bucket stays partitioned by prefix.
 */
export class ObjectStoreWithPrefix implements ObjectStore {
  private readonly prefix: string;

  constructor(
    private readonly inner: ObjectStore,
    prefix: string
  ) {
    this.prefix = normalizeObjectStorePrefix(prefix);
  }

  private scopedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  get(key: string): Promise<StoredObject | null> {
    return this.inner.get(this.scopedKey(key));
  }

  put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    return this.inner.put(this.scopedKey(key), bytes, contentType);
  }

  head(key: string): Promise<boolean> {
    return this.inner.head(this.scopedKey(key));
  }

  delete(key: string): Promise<void> {
    return this.inner.delete(this.scopedKey(key));
  }

  getUri(key: string): Promise<string | null> {
    return this.inner.getUri(this.scopedKey(key));
  }

  withPrefix(subPrefix: string): ObjectStore {
    return new ObjectStoreWithPrefix(
      this.inner,
      joinObjectStorePrefixes(this.prefix, subPrefix)
    );
  }
}
