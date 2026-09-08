import { assert, hotAssert, type Assert } from '@pkgs/assert';
import { AwsClient } from 'aws4fetch';

import { ObjectStoreWithPrefix } from './impl-with-prefix';
import type { ObjectStore, StoredObject } from './interface';
import { applyStoreKeyPrefix, validateStoreNamespace } from './object-key';
import { s3PutObjectHeaders } from './s3-put-headers';

export type ObjectStoreS3ConnectionConfig = {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
};

export type ObjectStoreS3Config = ObjectStoreS3ConnectionConfig & {
  readonly storeNamespace: string;
};

function encodeS3Key(key: string): string {
  assert.nonEmptyString(key, 'encodeS3Key: key must be non-empty');
  const ha: Assert = hotAssert();
  const out = key
    .split('/')
    .map((segment) => {
      ha.string(segment, 'encodeS3Key: segment must be a string');
      return encodeURIComponent(segment);
    })
    .join('/');
  assert.nonEmptyString(out, 'encodeS3Key: result must be non-empty');
  return out;
}

/**
 * S3-compatible {@link ObjectStore} (Backblaze B2, AWS S3, Cloudflare R2 via
 * HTTP API). Uses {@link AwsClient} from `aws4fetch` for SigV4 signing in
 * Workers and Node.
 */
export class ObjectStoreImplS3 implements ObjectStore {
  private readonly client: AwsClient;
  private readonly baseUrl: string;
  private readonly storeNamespace: string;

  constructor(config: ObjectStoreS3Config) {
    assert.record(config, 'ObjectStoreImplS3: config must be an object');
    assert.nonEmptyString(
      config.endpoint,
      'ObjectStoreImplS3: endpoint is required'
    );
    assert.nonEmptyString(
      config.region,
      'ObjectStoreImplS3: region is required'
    );
    assert.nonEmptyString(
      config.accessKeyId,
      'ObjectStoreImplS3: accessKeyId is required'
    );
    assert.nonEmptyString(
      config.secretAccessKey,
      'ObjectStoreImplS3: secretAccessKey is required'
    );
    assert.nonEmptyString(
      config.bucket,
      'ObjectStoreImplS3: bucket is required'
    );
    assert.string(
      config.storeNamespace,
      'ObjectStoreImplS3: storeNamespace must be a string'
    );
    validateStoreNamespace(config.storeNamespace);
    this.storeNamespace = config.storeNamespace;
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: 's3',
    });
    const endpoint = config.endpoint.replace(/\/$/, '');
    this.baseUrl = `${endpoint}/${config.bucket}`;
    assert.equals(
      this.storeNamespace,
      config.storeNamespace,
      'ObjectStoreImplS3: storeNamespace invariant'
    );
    assert.defined(this.client, 'ObjectStoreImplS3: client must be set');
    assert.nonEmptyString(
      this.baseUrl,
      'ObjectStoreImplS3: baseUrl must be non-empty'
    );
  }

  private resolveKey(key: string): string {
    assert.string(key, 'ObjectStoreImplS3.resolveKey: key must be a string');
    const out = applyStoreKeyPrefix(key, this.storeNamespace);
    assert.nonEmptyString(
      out,
      'ObjectStoreImplS3.resolveKey: resolved key must be non-empty'
    );
    return out;
  }

  private objectUrl(key: string): string {
    assert.string(key, 'ObjectStoreImplS3.objectUrl: key must be a string');
    const url = `${this.baseUrl}/${encodeS3Key(this.resolveKey(key))}`;
    assert.nonEmptyString(
      url,
      'ObjectStoreImplS3.objectUrl: url must be non-empty'
    );
    assert.ok(
      url.startsWith(this.baseUrl),
      'ObjectStoreImplS3.objectUrl: baseUrl invariant'
    );
    return url;
  }

  async get(key: string): Promise<StoredObject | null> {
    assert.string(key, 'ObjectStoreImplS3.get: key must be a string');
    const response = await this.client.fetch(this.objectUrl(key));
    assert.defined(response, 'ObjectStoreImplS3.get: response is required');
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`S3 GET ${key} failed: HTTP ${String(response.status)}`);
    }
    const body = response.body;
    if (body === null) {
      throw new Error(`S3 GET ${key} returned empty body`);
    }
    assert.defined(body, 'ObjectStoreImplS3.get: body must be set here');
    assert.defined(
      response.headers.get('content-type') ?? 'application/octet-stream',
      'ObjectStoreImplS3.get: contentType fallback valid'
    );
    const contentType =
      response.headers.get('content-type') ?? 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    assert.ok(
      contentLength === null || typeof contentLength === 'string',
      'ObjectStoreImplS3.get: content-length must be a string when present'
    );
    const size =
      contentLength !== null && contentLength.length > 0
        ? Number.parseInt(contentLength, 10)
        : 0;
    assert.nonNegativeInteger(
      size,
      'ObjectStoreImplS3.get: size must be a non-negative integer'
    );
    assert.nonEmptyString(
      contentType,
      'ObjectStoreImplS3.get: contentType must be non-empty'
    );
    return { body, contentType, size };
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<void> {
    assert.string(key, 'ObjectStoreImplS3.put: key must be a string');
    assert.instanceOf(
      bytes,
      Uint8Array,
      'ObjectStoreImplS3.put: bytes must be a Uint8Array'
    );
    assert.nonEmptyString(
      contentType,
      'ObjectStoreImplS3.put: contentType must be non-empty'
    );
    const response = await this.client.fetch(this.objectUrl(key), {
      method: 'PUT',
      body: bytes as unknown as BodyInit,
      headers: s3PutObjectHeaders(bytes, contentType),
    });
    assert.defined(response, 'ObjectStoreImplS3.put: response is required');
    if (!response.ok) {
      throw new Error(`S3 PUT ${key} failed: HTTP ${String(response.status)}`);
    }
  }

  async head(key: string): Promise<boolean> {
    assert.string(key, 'ObjectStoreImplS3.head: key must be a string');
    const response = await this.client.fetch(this.objectUrl(key), {
      method: 'HEAD',
    });
    assert.defined(response, 'ObjectStoreImplS3.head: response is required');
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`S3 HEAD ${key} failed: HTTP ${String(response.status)}`);
    }
    return true;
  }

  async delete(key: string): Promise<void> {
    assert.string(key, 'ObjectStoreImplS3.delete: key must be a string');
    const response = await this.client.fetch(this.objectUrl(key), {
      method: 'DELETE',
    });
    assert.defined(response, 'ObjectStoreImplS3.delete: response is required');
    if (response.status === 404) return;
    if (!response.ok) {
      throw new Error(
        `S3 DELETE ${key} failed: HTTP ${String(response.status)}`
      );
    }
  }

  async getUri(_key: string): Promise<string | null> {
    assert.string(_key, 'ObjectStoreImplS3.getUri: key must be a string');
    return null;
  }

  withPrefix(prefix: string): ObjectStore {
    assert.string(
      prefix,
      'ObjectStoreImplS3.withPrefix: prefix must be a string'
    );
    const out = new ObjectStoreWithPrefix(this, prefix);
    assert.ok(
      out instanceof ObjectStoreWithPrefix,
      'ObjectStoreImplS3.withPrefix: must return ObjectStoreWithPrefix'
    );
    return out;
  }
}
