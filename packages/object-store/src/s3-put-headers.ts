import { createHash } from 'node:crypto';

function contentMd5Base64Node(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('base64');
}

function contentMd5Base64Bun(bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher('md5');
  hasher.update(bytes);
  return hasher.digest('base64');
}

function contentMd5Base64(bytes: Uint8Array): string {
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
  return {
    'Content-Type': contentType,
    'Content-MD5': contentMd5Base64(bytes),
  };
}
