import { describe, expect, test } from 'bun:test';

import {
  applyStoreKeyPrefix,
  enforceKeyPrefix,
  fullStoreKeyPrefix,
  OBJECT_KEY_PREFIX,
  validateStoreNamespace,
} from './object-key';

describe('validateStoreNamespace', () => {
  test('accepts valid namespace', () => {
    expect(() => validateStoreNamespace('prd')).not.toThrow();
  });

  test('rejects invalid namespace', () => {
    expect(() => validateStoreNamespace('')).toThrow();
    expect(() => validateStoreNamespace('a/b')).toThrow();
    expect(() => validateStoreNamespace('..')).toThrow();
  });
});

describe('enforceKeyPrefix', () => {
  test('prepends the global prefix', () => {
    expect(String(enforceKeyPrefix('artifacts/abc'))).toBe(
      `${OBJECT_KEY_PREFIX}/artifacts/abc`
    );
  });

  test('rejects leading slash keys', () => {
    expect(() => enforceKeyPrefix('/artifacts/abc')).toThrow();
  });
});

describe('fullStoreKeyPrefix', () => {
  test('composes global and store namespace', () => {
    expect(fullStoreKeyPrefix('prd')).toBe(`${OBJECT_KEY_PREFIX}/prd`);
  });
});

describe('applyStoreKeyPrefix', () => {
  test('inserts store namespace after global prefix', () => {
    expect(String(applyStoreKeyPrefix('abc123', 'prd'))).toBe(
      `${OBJECT_KEY_PREFIX}/prd/abc123`
    );
  });

  test('is idempotent when namespace already present', () => {
    const physical = `${OBJECT_KEY_PREFIX}/prd/abc123`;
    expect(String(applyStoreKeyPrefix(physical, 'prd'))).toBe(physical);
  });

  test('handles logical keys that already include global prefix', () => {
    const logical = `${OBJECT_KEY_PREFIX}/abc123`;
    expect(String(applyStoreKeyPrefix(logical, 'prd'))).toBe(
      `${OBJECT_KEY_PREFIX}/prd/abc123`
    );
  });
});
