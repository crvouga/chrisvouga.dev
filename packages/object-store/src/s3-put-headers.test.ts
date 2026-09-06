import { describe, expect, test } from 'bun:test';

import { s3PutObjectHeaders } from './s3-put-headers';

describe('s3PutObjectHeaders', () => {
  test('includes Content-MD5 for B2 Object Lock buckets', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const headers = s3PutObjectHeaders(bytes, 'application/octet-stream');
    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(headers['Content-MD5']).toBe('Uonfc331cyb83SJZevsfrA==');
  });
});
