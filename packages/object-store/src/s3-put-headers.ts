import { assert } from '@pkgs/assert';
import { createHash } from 'node:crypto';

function contentMd5Base64Node(bytes: Uint8Array): string {
  assert.instanceOf(
    bytes,
    Uint8Array,
    'contentMd5Base64Node: bytes must be a Uint8Array'
  );
  const digest = createHash('md5').update(bytes).digest('base64');
  assert.nonEmptyString(
    digest,
    'contentMd5Base64Node: digest must be non-empty'
  );
  return digest;
}

function contentMd5Base64Bun(bytes: Uint8Array): string {
  assert.instanceOf(
    bytes,
    Uint8Array,
    'contentMd5Base64Bun: bytes must be a Uint8Array'
  );
  const hasher = new Bun.CryptoHasher('md5');
  hasher.update(bytes);
  const digest = hasher.digest('base64');
  assert.nonEmptyString(
    digest,
    'contentMd5Base64Bun: digest must be non-empty'
  );
  return digest;
}

function contentMd5Base64(bytes: Uint8Array): string {
  assert.instanceOf(
    bytes,
    Uint8Array,
    'contentMd5Base64: bytes must be a Uint8Array'
  );
  if (typeof Bun !== 'undefined' && 'CryptoHasher' in Bun) {
    return contentMd5Base64Bun(bytes);
  }
  return contentMd5Base64Node(bytes);
}

/**
 * Headers required by some S3-compatible stores (e.g. Backblaze B2 with Object
 * Lock) for PutObject. Uses Content-MD5 only — B2 rejects x-amz-sdk-checksum-*.
 */
export function s3PutObjectHeaders(
  bytes: Uint8Array,
  contentType: string
): Record<string, string> {
  assert.instanceOf(
    bytes,
    Uint8Array,
    's3PutObjectHeaders: bytes must be a Uint8Array'
  );
  assert.nonEmptyString(
    contentType,
    's3PutObjectHeaders: contentType must be non-empty'
  );
  const headers = {
    'Content-Type': contentType,
    'Content-MD5': contentMd5Base64(bytes),
  };
  assert.record(headers, 's3PutObjectHeaders: headers must be an object');
  assert.field(
    headers,
    'Content-Type',
    's3PutObjectHeaders: Content-Type must be set'
  );
  assert.field(
    headers,
    'Content-MD5',
    's3PutObjectHeaders: Content-MD5 must be set'
  );
  assert.nonEmptyString(
    headers['Content-MD5'],
    's3PutObjectHeaders: Content-MD5 must be non-empty'
  );
  return headers;
}
