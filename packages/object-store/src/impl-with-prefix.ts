import { assert } from '@pkgs/assert';
import type { ObjectStore, StoredObject } from './interface';

export function normalizeObjectStorePrefix(prefix: string): string {
  assert.string(prefix, 'normalizeObjectStorePrefix: prefix must be a string');
  if (prefix.length === 0) {
    throw new Error('ObjectStoreWithPrefix: prefix must be non-empty');
  }
  const out = prefix.endsWith('/') ? prefix : `${prefix}/`;
  assert.nonEmptyString(
    out,
    'normalizeObjectStorePrefix: result must be non-empty'
  );
  assert.ok(
    out.endsWith('/'),
    'normalizeObjectStorePrefix: result must end with slash'
  );
  return out;
}

function joinObjectStorePrefixes(left: string, right: string): string {
  assert.nonEmptyString(
    left,
    'joinObjectStorePrefixes: left must be non-empty'
  );
  assert.nonEmptyString(
    right,
    'joinObjectStorePrefixes: right must be non-empty'
  );
  const out = normalizeObjectStorePrefix(
    `${left}${normalizeObjectStorePrefix(right)}`
  );
  assert.ok(
    out.endsWith('/'),
    'joinObjectStorePrefixes: result must end with slash'
  );
  return out;
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
    assert.defined(inner, 'ObjectStoreWithPrefix: inner store is required');
    assert.string(prefix, 'ObjectStoreWithPrefix: prefix must be a string');
    this.prefix = normalizeObjectStorePrefix(prefix);
    assert.equals(this.inner, inner, 'ObjectStoreWithPrefix: inner invariant');
    assert.ok(
      this.prefix.endsWith('/'),
      'ObjectStoreWithPrefix: prefix must end with slash'
    );
  }

  private scopedKey(key: string): string {
    assert.string(key, 'ObjectStoreWithPrefix.scopedKey: key must be a string');
    const out = `${this.prefix}${key}`;
    assert.ok(
      out.startsWith(this.prefix),
      'ObjectStoreWithPrefix.scopedKey: prefix invariant'
    );
    return out;
  }

  get(key: string): Promise<StoredObject | null> {
    assert.string(key, 'ObjectStoreWithPrefix.get: key must be a string');
    return this.inner.get(this.scopedKey(key));
  }

  put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    assert.string(key, 'ObjectStoreWithPrefix.put: key must be a string');
    assert.instanceOf(
      bytes,
      Uint8Array,
      'ObjectStoreWithPrefix.put: bytes must be a Uint8Array'
    );
    assert.nonEmptyString(
      contentType,
      'ObjectStoreWithPrefix.put: contentType must be non-empty'
    );
    return this.inner.put(this.scopedKey(key), bytes, contentType);
  }

  head(key: string): Promise<boolean> {
    assert.string(key, 'ObjectStoreWithPrefix.head: key must be a string');
    return this.inner.head(this.scopedKey(key));
  }

  delete(key: string): Promise<void> {
    assert.string(key, 'ObjectStoreWithPrefix.delete: key must be a string');
    return this.inner.delete(this.scopedKey(key));
  }

  getUri(key: string): Promise<string | null> {
    assert.string(key, 'ObjectStoreWithPrefix.getUri: key must be a string');
    return this.inner.getUri(this.scopedKey(key));
  }

  withPrefix(subPrefix: string): ObjectStore {
    assert.string(
      subPrefix,
      'ObjectStoreWithPrefix.withPrefix: prefix must be a string'
    );
    const out = new ObjectStoreWithPrefix(
      this.inner,
      joinObjectStorePrefixes(this.prefix, subPrefix)
    );
    assert.ok(
      out instanceof ObjectStoreWithPrefix,
      'ObjectStoreWithPrefix.withPrefix: must return ObjectStoreWithPrefix'
    );
    return out;
  }
}
