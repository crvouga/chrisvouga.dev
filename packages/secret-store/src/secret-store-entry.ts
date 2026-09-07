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
  }

  /** Default value to write when the secret is missing, if any. */
  seed(): string | undefined {
    return this.seedFn();
  }

  /** Normalizes a raw stored value into its canonical form. */
  transform(value: string): string {
    return this.transformFn(value);
  }

  /**
   * Validates `value`; returns an error message or null when valid. When the
   * entry carries an {@link invalidHint}, it is appended to the returned error
   * to aid debugging.
   */
  validate(value: string): string | null {
    const error = this.validateFn(value);
    if (error === null) return null;
    return this.invalidHint !== undefined
      ? `${error}\n${this.invalidHint}`
      : error;
  }

  /**
   * Human-readable multi-line block describing the secret and how to obtain or
   * debug it. Used to render skip/warn messages without dumping secret values.
   *
   * @param prefix Lines are emitted with this indentation prefix.
   */
  describe(prefix = '  '): string {
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
    return lines.join('\n');
  }
}
