import { Assert } from './assert';

/**
 * Single, repo-wide switch that governs whether hot-path assert helpers
 * (`assertKeywordRecord`, `assertNamespacedKeyword`, `assertKvRecord`,
 * `assertMessageEnvelope`, …) actually validate at runtime or short-circuit
 * to a typed no-op.
 *
 * **Why this exists.** Helpers that loop over state keys or run regex-style
 * keyword checks pay an O(state keys) cost per call. On animation-frame hot
 * paths (per-dispatch, per-routed-message, per-kv-get) this can add up to a
 * single-frame spike. Always-on invariant checks belong on cold paths
 * (bootstrap, trust boundaries, persisted-blob parse, tests); the hot-path
 * variant trades runtime safety for throughput.
 *
 * **Source of truth.** Default is {@link isDevBuild}: dev/test runs validate;
 * production builds short-circuit. The default can be overridden once at
 * process boot via {@link setHotAssertsEnabled} (e.g. QA force-enabling
 * checks in production, or a test forcing checks off to reproduce a perf
 * bug). After boot, every call to {@link hotAssert} returns the same cached
 * instance so the flag is effectively immutable from the consumer's view.
 *
 * **Usage.**
 * ```ts
 * import { hotAssert } from '@pkgs/assert';
 * import { assertKeywordRecord } from '@pkgs/keyword';
 *
 * // hot path: per-dispatch / per-frame
 * assertKeywordRecord(hotAssert(), state, 'room.fold');
 *
 * // cold path: bootstrap / trust boundary
 * import { assert } from '@pkgs/assert';
 * assertKeywordRecord(assert, persistedBlob, 'storage.parse');
 * ```
 */

const crashAssert: Assert = Assert.crash();
const noopAssert: Assert = Assert.noop();

let enabled: boolean = isDevBuild();

/**
 * `true` when the current bundle was produced for development:
 * - React Native / Expo bundles set `globalThis.__DEV__ = true` in dev.
 * - Node / Cloudflare Worker bundles substitute `process.env.NODE_ENV`
 *   at build time; anything other than `'production'` counts as dev.
 *
 * Returns `false` when neither signal is available (assume production for
 * safety: better to skip a check than spend a frame validating in prod).
 */
export function isDevBuild(): boolean {
  const dev = (globalThis as { __DEV__?: unknown }).__DEV__;
  if (typeof dev === 'boolean') return dev;
  if (typeof process !== 'undefined') {
    const env = (process as { env?: { NODE_ENV?: string } }).env;
    if (env && typeof env.NODE_ENV === 'string') {
      return env.NODE_ENV !== 'production';
    }
  }
  return false;
}

/**
 * Returns the {@link Assert} instance every hot-path helper should use.
 * Resolves to the always-crashing instance when hot asserts are enabled,
 * and to a runtime no-op when disabled. Both instances are cached, so this
 * call is O(1) with no allocation.
 */
export function hotAssert(): Assert {
  return enabled ? crashAssert : noopAssert;
}

/**
 * `true` when {@link hotAssert} currently returns the validating instance.
 * Mostly useful for tests and the polyfill-entry seam that wires QA overrides.
 */
export function areHotAssertsEnabled(): boolean {
  return enabled;
}

/**
 * Single repo-wide seam for forcing hot-path asserts on or off at runtime.
 * Intended to be called at most once, very early in the process lifecycle
 * (e.g. from `polyfill-entry.ts` reading an env flag). Calling it later is
 * legal but may produce inconsistent observations if a hot helper has
 * already captured the previous value of {@link hotAssert}.
 */
export function setHotAssertsEnabled(value: boolean): void {
  enabled = value;
}
