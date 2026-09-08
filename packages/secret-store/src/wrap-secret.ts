import { assert } from '@pkgs/assert';
import { SecretString } from '@pkgs/secret-string/secret-string';

/** Wrap a raw secret string into a redacted {@link SecretString}. */
export function wrapSecret(name: string, value: string): SecretString {
  assert.nonEmptyString(name, 'wrapSecret: name must be non-empty');
  assert.string(value, 'wrapSecret: value must be a string');
  const wrapped = new SecretString(name, value);
  assert.ok(
    wrapped instanceof SecretString,
    'wrapSecret: must return SecretString'
  );
  assert.equals(wrapped.name, name, 'wrapSecret: name round-trips');
  assert.equals(
    wrapped.readSecretValue(),
    value,
    'wrapSecret: value round-trips'
  );
  return wrapped;
}

/** `null`-preserving variant of {@link wrapSecret}. */
export function wrapSecretOptional(
  name: string,
  value: string | null
): SecretString | null {
  assert.nonEmptyString(name, 'wrapSecretOptional: name must be non-empty');
  assert.ok(
    value === null || typeof value === 'string',
    'wrapSecretOptional: value must be a string or null'
  );
  if (value === null) {
    return null;
  }
  return wrapSecret(name, value);
}
