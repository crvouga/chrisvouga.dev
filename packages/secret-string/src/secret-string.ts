import { assert } from '@pkgs/assert';

/**
 * Wrapper around a `string` that is meant to stay out of logs.
 *
 * Instances render as `SecretString(NAME)` from every common JavaScript
 * serialization path:
 *
 * - `console.log(s)` / `util.inspect(s)` via `Symbol.for('nodejs.util.inspect.custom')`
 * - `String(s)` / template literals via `toString()`
 * - `JSON.stringify(s)` (including when nested inside an object/array) via `toJSON()`
 * - numeric / primitive coercion via `valueOf()` — returns the redacted label
 *   rather than the raw value
 *
 * The raw secret is only reachable via {@link SecretString.readSecretValue},
 * which makes leaks easy to grep for.
 *
 * Limitations: a caller that explicitly does `s.readSecretValue()` and then
 * logs the returned string will still leak the value. Devtools that
 * introspect private fields are out of scope.
 */
export class SecretString {
  readonly #name: string;
  readonly #value: string;

  constructor(name: string, value: string) {
    assert.string(name, 'SecretString: name must be a string');
    assert.string(value, 'SecretString: value must be a string');
    if (name.trim().length === 0) {
      throw new Error('SecretString name must be non-empty');
    }
    this.#name = name;
    this.#value = value;
    assert.equals(this.#name, name, 'SecretString: name invariant');
    assert.equals(this.#value, value, 'SecretString: value invariant');
  }

  /** Logical env key label — safe to log. */
  get name(): string {
    return this.#name;
  }

  /** Explicit opt-in to the raw secret value. */
  readSecretValue(): string {
    const value = this.#value;
    assert.string(value, 'SecretString: value invariant broken');
    return value;
  }

  toString(): string {
    const rendered = `SecretString(${this.#name})`;
    assert.nonEmptyString(rendered, 'SecretString: rendered label non-empty');
    return rendered;
  }

  toJSON(): string {
    return this.toString();
  }

  valueOf(): string {
    return this.toString();
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }
}
