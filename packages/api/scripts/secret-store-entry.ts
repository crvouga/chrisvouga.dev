/** Consumers of a secret — the cache server and/or Turbo CLI clients. */
export type SecretUsedBy = 'server' | 'client';

export type SecretStoreEntryOptions = {
  readonly key: string;
  readonly required: boolean;
  readonly usedBy: readonly SecretUsedBy[];
  readonly hint: string;
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
 * into its canonical form, and how to validate that a value is usable. Entries
 * are collected into a central register (see `vault-secrets-registry`).
 */
export class SecretStoreEntry {
  readonly key: string;
  readonly required: boolean;
  readonly usedBy: readonly SecretUsedBy[];
  readonly hint: string;

  private readonly seedFn: () => string | undefined;
  private readonly transformFn: (value: string) => string;
  private readonly validateFn: (value: string) => string | null;

  constructor(options: SecretStoreEntryOptions) {
    this.key = options.key;
    this.required = options.required;
    this.usedBy = options.usedBy;
    this.hint = options.hint;
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

  /** Validates `value`; returns an error message or null when valid. */
  validate(value: string): string | null {
    return this.validateFn(value);
  }
}
