import type { SecretString } from '@pkgs/secret-string/secret-string';

export type SecretStoreGetInit = {
  signal?: AbortSignal;
  /**
   * Skip any in-memory caching layer (e.g. {@link CachingSecretStore}) and
   * read directly from the underlying transport. Implementations without a
   * cache ignore this flag. The freshly-fetched value is still written back
   * to the cache so subsequent (non-`force`) reads observe it. Use sparingly:
   * this exists for self-healing paths (e.g. webhook signature failure should
   * bypass a stale cached signing secret), not for routine reads.
   */
  force?: boolean;
};

export type SecretStoreSetInit = {
  signal?: AbortSignal;
};

/**
 * Async key/value secrets — both read and write surfaces in one abstraction.
 * Implementations may call remote stores (e.g. Vault KV v2) over HTTP, shell out
 * to a CLI, or compose other implementations.
 *
 * Read semantics:
 *   - All read APIs return {@link SecretString} (or `null` for optional misses)
 *     so the raw value cannot be accidentally `console.log`-ed or
 *     `JSON.stringify`-ed. Callers must opt in to the raw value via
 *     {@link SecretString.readSecretValue}.
 *   - Optional keys: absent or blank after trim → `null`. Transport / HTTP /
 *     parse errors throw.
 *
 * Write semantics:
 *   - {@link setSecret} takes a plaintext `string` (callers supply the raw
 *     value to write).
 *   - {@link setSecret} MUST be idempotent: writing the same value twice MUST
 *     succeed; writing a different value MUST overwrite without error.
 *   - Implementations whose underlying transport cannot write (e.g. the
 *     Worker-side HTTP read endpoint) MUST throw a clearly-typed error from
 *     {@link setSecret} rather than silently no-op.
 */
export interface SecretStore {
  getRequired(name: string, init?: SecretStoreGetInit): Promise<SecretString>;

  /** Missing or blank (after trim) → `null`. HTTP / parse failures still throw. */
  getOptional(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString | null>;

  /**
   * One batch fetch when supported. Throws if any name is missing or blank.
   * Implementations should prefer a single network round-trip.
   */
  getRequiredMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString>>;

  /**
   * Best-effort batch fetch: returns one entry per requested name. Missing or
   * blank values map to `null` (no throw). Transport / parse failures still
   * throw. Implementations should prefer a single network round-trip — this is
   * the primitive {@link CachingSecretStore} uses to coalesce concurrent
   * `getRequired` / `getOptional` cache misses into one upstream call so a
   * burst of inbound requests does not fan out into a burst of secret-store
   * requests (Vault rate-limits at HTTP 429).
   */
  getOptionalMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString | null>>;

  setSecret(
    name: string,
    value: string,
    init?: SecretStoreSetInit
  ): Promise<void>;
}
