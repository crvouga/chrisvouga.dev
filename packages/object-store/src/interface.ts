/**
 * Content-addressed binary object storage.
 *
 * Tiny, async, transport-agnostic surface — exactly what a "blob keyed by id"
 * cache needs (TTS audio, exported files, derived avatars, etc.). Implementations
 * live in sibling `impl-*.ts` files (S3/B2, in-memory, expo file-system).
 *
 * Mirrors the {@link ../sql-client/interface.ts SqlClient} shape: one interface,
 * multiple `impl-*.ts` siblings, plus a conformance suite in `interface.test.ts`.
 *
 * Read semantics:
 *   - {@link ObjectStore.get} returns `null` when the key is missing. Transport /
 *     parse errors throw.
 *   - {@link ObjectStore.head} returns `false` for a missing key (never throws on
 *     "not found"). Transport errors throw.
 *
 * Write semantics:
 *   - {@link ObjectStore.put} MUST be idempotent: writing the same key twice
 *     overwrites without error. Stored `contentType` MUST round-trip through
 *     {@link ObjectStore.get}.
 *   - {@link ObjectStore.delete} on a missing key is a no-op (does not throw).
 *
 * URI semantics:
 *   - {@link ObjectStore.getUri} returns a URL the host runtime can load
 *     directly (`file://` on native, `blob:` on web). Stores that don't expose
 *     direct URLs (e.g. remote S3/B2 — bytes must be streamed through HTTP)
 *     return `null`. Returns `null` when the key is missing.
 */

export interface StoredObject {
  /** Stream of stored bytes. Single-use; consume or discard before issuing more I/O on the same store. */
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
  readonly size: number;
}

export interface ObjectStore {
  /** Returns the stored object, or `null` if no value exists for `key`. */
  get(key: string): Promise<StoredObject | null>;

  /** Idempotently writes `bytes` under `key` with the given `contentType`. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;

  /** `true` iff a value exists for `key`. Never throws on "not found". */
  head(key: string): Promise<boolean>;

  /** Removes the value at `key` if present. No-op when missing. */
  delete(key: string): Promise<void>;

  /**
   * Returns a URL that the host runtime can load directly without reading bytes
   * through {@link ObjectStore.get} again. Returns `null` for missing keys, and
   * `null` for stores whose backend has no addressable URL (e.g. S3/B2).
   */
  getUri(key: string): Promise<string | null>;

  /**
   * Returns a new store scoped to `prefix`. Caller keys are relative (must not
   * include the prefix). All I/O operates on `prefix + key`. Nested calls compose
   * prefixes (`a/` + `b/` → `a/b/`).
   */
  withPrefix(prefix: string): ObjectStore;
}
