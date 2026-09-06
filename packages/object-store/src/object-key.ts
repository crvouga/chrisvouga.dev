export const OBJECT_KEY_PREFIX = 'turbo-cache' as const;

export type PrefixedObjectKey = string & {
  readonly __brand: 'PrefixedObjectKey';
};

const PREFIX_WITH_SLASH = `${OBJECT_KEY_PREFIX}/`;

function validateSegment(segment: string): void {
  if (!segment || segment === '.' || segment === '..') {
    throw new Error(`Invalid object key segment: ${segment}`);
  }
  if (segment.includes('/') || segment.includes('\\')) {
    throw new Error(
      `Object key segment must not contain path separators: ${segment}`
    );
  }
}

function toPrefixedKey(key: string): PrefixedObjectKey {
  if (!key.startsWith(PREFIX_WITH_SLASH)) {
    throw new Error(
      `Object key must start with "${PREFIX_WITH_SLASH}": ${key}`
    );
  }
  if (key.includes('..')) {
    throw new Error(`Object key must not contain path traversal: ${key}`);
  }
  return key as PrefixedObjectKey;
}

/**
 * Validate a store namespace segment (single path component, no separators).
 */
export function validateStoreNamespace(namespace: string): void {
  validateSegment(namespace);
}

/**
 * Full physical key prefix for a store namespace: `turbo-cache/<namespace>`.
 */
export function fullStoreKeyPrefix(storeNamespace: string): string {
  validateStoreNamespace(storeNamespace);
  return `${OBJECT_KEY_PREFIX}/${storeNamespace}`;
}

/**
 * Enforce the app key prefix at runtime. Prepends when missing; throws on escape.
 */
export function enforceKeyPrefix(key: string): PrefixedObjectKey {
  if (key.startsWith('..') || key.startsWith('/') || key.startsWith('\\')) {
    throw new Error(
      `Object key must not start with a path separator or traversal: ${key}`
    );
  }
  if (key.includes('..')) {
    throw new Error(`Object key must not contain path traversal: ${key}`);
  }

  const normalized = key.startsWith(PREFIX_WITH_SLASH)
    ? key
    : `${PREFIX_WITH_SLASH}${key}`;
  return toPrefixedKey(normalized);
}

/**
 * Apply a store namespace to a logical key, producing a physical key:
 * `turbo-cache/<storeNamespace>/<rest>`.
 * Idempotent when the namespace is already present.
 */
export function applyStoreKeyPrefix(
  key: string,
  storeNamespace: string
): PrefixedObjectKey {
  validateStoreNamespace(storeNamespace);
  const logicalKey = enforceKeyPrefix(key);
  const afterApp = logicalKey.slice(PREFIX_WITH_SLASH.length);

  if (
    afterApp === storeNamespace ||
    afterApp.startsWith(`${storeNamespace}/`)
  ) {
    return logicalKey;
  }

  return toPrefixedKey(`${OBJECT_KEY_PREFIX}/${storeNamespace}/${afterApp}`);
}
