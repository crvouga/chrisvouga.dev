import { SecretString } from '@pkgs/secret-string/secret-string';

/** Wrap a raw secret string into a redacted {@link SecretString}. */
export function wrapSecret(name: string, value: string): SecretString {
  return new SecretString(name, value);
}

/** `null`-preserving variant of {@link wrapSecret}. */
export function wrapSecretOptional(
  name: string,
  value: string | null
): SecretString | null {
  return value === null ? null : new SecretString(name, value);
}
