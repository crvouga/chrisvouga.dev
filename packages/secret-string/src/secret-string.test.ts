import { describe, expect, test } from 'bun:test';
import { inspect } from 'node:util';
import { SecretString } from './secret-string';

describe('SecretString', () => {
  const NAME = 'MY_SECRET';
  const RAW = 'super-sensitive-value-do-not-log';

  test('readSecretValue returns the raw value', () => {
    const s = new SecretString(NAME, RAW);
    expect(s.readSecretValue()).toBe(RAW);
  });

  test('exposes the name', () => {
    const s = new SecretString(NAME, RAW);
    expect(s.name).toBe(NAME);
  });

  test('toString redacts the value', () => {
    const s = new SecretString(NAME, RAW);
    expect(s.toString()).toBe(`SecretString(${NAME})`);
  });

  test('String() coercion does not leak the value', () => {
    const s = new SecretString(NAME, RAW);
    expect(String(s)).toBe(`SecretString(${NAME})`);
    expect(String(s).includes(RAW)).toBe(false);
  });

  test('template literal does not leak the value', () => {
    const s = new SecretString(NAME, RAW);
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- exercise implicit coercion path
    const rendered = `value=${s}`;
    expect(rendered).toBe(`value=SecretString(${NAME})`);
    expect(rendered.includes(RAW)).toBe(false);
  });

  test('JSON.stringify on the instance redacts the value', () => {
    const s = new SecretString(NAME, RAW);
    expect(JSON.stringify(s)).toBe(`"SecretString(${NAME})"`);
  });

  test('JSON.stringify on a nested object redacts the value', () => {
    const s = new SecretString(NAME, RAW);
    const json = JSON.stringify({ token: s, other: 1 });
    expect(json).toBe(`{"token":"SecretString(${NAME})","other":1}`);
    expect(json.includes(RAW)).toBe(false);
  });

  test('util.inspect does not leak the value', () => {
    const s = new SecretString(NAME, RAW);
    const out = inspect(s);
    expect(out).toBe(`SecretString(${NAME})`);
    expect(out.includes(RAW)).toBe(false);
  });

  test('util.inspect on a nested object does not leak the value', () => {
    const s = new SecretString(NAME, RAW);
    const out = inspect({ token: s });
    expect(out.includes(RAW)).toBe(false);
    expect(out).toContain(`SecretString(${NAME})`);
  });

  test('valueOf returns the redacted label so primitive coercion does not leak', () => {
    const s = new SecretString(NAME, RAW);
    expect(s.valueOf()).toBe(`SecretString(${NAME})`);
  });

  test('throws on empty or whitespace-only name', () => {
    expect(() => new SecretString('', 'v')).toThrow();
    expect(() => new SecretString('   ', 'v')).toThrow();
  });

  test('accepts an empty raw value', () => {
    const s = new SecretString(NAME, '');
    expect(s.readSecretValue()).toBe('');
    expect(String(s)).toBe(`SecretString(${NAME})`);
  });
});
