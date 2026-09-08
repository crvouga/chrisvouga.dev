import { assert } from '@pkgs/assert';

/** Consumers of a secret — the cache server, Turbo CLI clients, OpenCode, etc. */
export type SecretUsedBy = 'server' | 'client' | 'opencode' | string;

export type SecretStoreEntryOptions = {
  /** Canonical key/field name in the secret store (e.g. `OPENAI_API_KEY`). */
  readonly key: string;
  readonly required: boolean;
  readonly usedBy: readonly SecretUsedBy[];
  /** One-line hint of what the secret is / unlocks. */
  readonly hint: string;
  /** Plain-language description of what the secret is for. */
  readonly description?: string;
  /** Link to the provider's documentation. */
  readonly docsUrl?: string;
  /** Link to create / obtain / rotate the key (console, signup page). */
  readonly obtainUrl?: string;
  /** Deep link to the exact Vault UI path holding this secret. */
  readonly vaultUiPath?: string;
  /** Example (redacted) value shape, to help eyeball an invalid value. */
  readonly validExample?: string;
  /** Guidance for debugging when a stored value fails validation. */
  readonly invalidHint?: string;
  /** Returns a value to seed into the store when the key is missing (or undefined). */
  readonly seed?: () => string | undefined;
  /** Normalizes a raw stored value into its canonical form before use. */
  readonly transform?: (value: string) => string;
  /** Returns an error message when `value` is invalid, or null when valid. */
  readonly validate?: (value: string) => string | null;
};

/**
 * Declarative definition of a secret expected in the secret store.
 *
 * A `SecretStoreEntry` encapsulates everything the tooling needs to know about
 * a single secret: how to seed it when missing, how to transform a raw value
 * into its canonical form, how to validate that a value is usable, and the
 * documentation needed to obtain a new one or debug an invalid one. Entries
 * are collected into a central register (see `vault-secrets-registry`).
 */
export class SecretStoreEntry {
  readonly key: string;
  readonly required: boolean;
  readonly usedBy: readonly SecretUsedBy[];
  readonly hint: string;
  readonly description: string | undefined;
  readonly docsUrl: string | undefined;
  readonly obtainUrl: string | undefined;
  readonly vaultUiPath: string | undefined;
  readonly validExample: string | undefined;
  readonly invalidHint: string | undefined;

  private readonly seedFn: () => string | undefined;
  private readonly transformFn: (value: string) => string;
  private readonly validateFn: (value: string) => string | null;

  constructor(options: SecretStoreEntryOptions) {
    assert.record(options, 'SecretStoreEntry: options must be an object');
    assert.nonEmptyString(
      options.key,
      'SecretStoreEntry: key must be non-empty'
    );
    assert.nonEmptyString(
      options.hint,
      'SecretStoreEntry: hint must be non-empty'
    );
    assert.array(options.usedBy, 'SecretStoreEntry: usedBy must be an array');
    assert.ok(
      options.seed === undefined || typeof options.seed === 'function',
      'SecretStoreEntry: seed must be a function when provided'
    );
    assert.ok(
      options.transform === undefined ||
        typeof options.transform === 'function',
      'SecretStoreEntry: transform must be a function when provided'
    );
    assert.ok(
      options.validate === undefined || typeof options.validate === 'function',
      'SecretStoreEntry: validate must be a function when provided'
    );
    this.key = options.key;
    this.required = options.required;
    this.usedBy = options.usedBy;
    this.hint = options.hint;
    this.description = options.description;
    this.docsUrl = options.docsUrl;
    this.obtainUrl = options.obtainUrl;
    this.vaultUiPath = options.vaultUiPath;
    this.validExample = options.validExample;
    this.invalidHint = options.invalidHint;
    this.seedFn = options.seed ?? (() => undefined);
    this.transformFn = options.transform ?? ((value: string) => value);
    this.validateFn = options.validate ?? (() => null);
    assert.equals(this.key, options.key, 'SecretStoreEntry: key invariant');
    assert.equals(this.hint, options.hint, 'SecretStoreEntry: hint invariant');
    assert.defined(this.seedFn, 'SecretStoreEntry: seedFn must be set');
    assert.defined(
      this.transformFn,
      'SecretStoreEntry: transformFn must be set'
    );
    assert.defined(this.validateFn, 'SecretStoreEntry: validateFn must be set');
  }

  /** Default value to write when the secret is missing, if any. */
  seed(): string | undefined {
    const out = this.seedFn();
    assert.ok(
      out === undefined || typeof out === 'string',
      'SecretStoreEntry.seed: must return string or undefined'
    );
    return out;
  }

  /** Normalizes a raw stored value into its canonical form. */
  transform(value: string): string {
    assert.string(value, 'SecretStoreEntry.transform: value must be a string');
    const out = this.transformFn(value);
    assert.string(out, 'SecretStoreEntry.transform: must return a string');
    return out;
  }

  /**
   * Validates `value`; returns an error message or null when valid. When the
   * entry carries an {@link invalidHint}, it is appended to the returned error
   * to aid debugging.
   */
  validate(value: string): string | null {
    assert.string(value, 'SecretStoreEntry.validate: value must be a string');
    const error = this.validateFn(value);
    assert.ok(
      error === null || typeof error === 'string',
      'SecretStoreEntry.validate: must return string or null'
    );
    if (error === null) return null;
    assert.defined(error, 'SecretStoreEntry.validate: error must be set here');
    if (this.invalidHint === undefined) {
      return error;
    }
    return `${error}\n${this.invalidHint}`;
  }

  /**
   * Human-readable multi-line block describing the secret and how to obtain or
   * debug it. Used to render skip/warn messages without dumping secret values.
   *
   * @param prefix Lines are emitted with this indentation prefix.
   */
  describe(prefix = '  '): string {
    assert.string(prefix, 'SecretStoreEntry.describe: prefix must be a string');
    const lines: string[] = [];
    lines.push(`${prefix}${this.key} — ${this.hint}`);
    if (this.description !== undefined) {
      lines.push(`${prefix}  ${this.description}`);
    }
    if (this.obtainUrl !== undefined) {
      lines.push(`${prefix}  get one: ${this.obtainUrl}`);
    }
    if (this.docsUrl !== undefined) {
      lines.push(`${prefix}  docs:    ${this.docsUrl}`);
    }
    if (this.vaultUiPath !== undefined) {
      lines.push(`${prefix}  vault:   ${this.vaultUiPath}`);
    }
    if (this.validExample !== undefined) {
      lines.push(`${prefix}  e.g.:    ${this.validExample}`);
    }
    if (this.invalidHint !== undefined) {
      lines.push(`${prefix}  if invalid: ${this.invalidHint}`);
    }
    const out = lines.join('\n');
    assert.nonEmptyString(out, 'SecretStoreEntry.describe: must be non-empty');
    return out;
  }
}
