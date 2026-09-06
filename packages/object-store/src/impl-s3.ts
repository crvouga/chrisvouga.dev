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
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
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
  }

  private resolveKey(key: string): string {
    return applyStoreKeyPrefix(key, this.storeNamespace);
  }

  private objectUrl(key: string): string {
    return `${this.baseUrl}/${encodeS3Key(this.resolveKey(key))}`;
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.client.fetch(this.objectUrl(key));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`S3 GET ${key} failed: HTTP ${String(response.status)}`);
    }
    const body = response.body;
    if (body === null) {
      throw new Error(`S3 GET ${key} returned empty body`);
    }
    const contentType =
      response.headers.get('content-type') ?? 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    const size =
      contentLength !== null && contentLength.length > 0
        ? Number.parseInt(contentLength, 10)
        : 0;
    return { body, contentType, size };
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<void> {
    const response = await this.client.fetch(this.objectUrl(key), {
      method: 'PUT',
      body: bytes as unknown as BodyInit,
      headers: s3PutObjectHeaders(bytes, contentType),
    });
    if (!response.ok) {
      throw new Error(`S3 PUT ${key} failed: HTTP ${String(response.status)}`);
    }
  }

  async head(key: string): Promise<boolean> {
    const response = await this.client.fetch(this.objectUrl(key), {
      method: 'HEAD',
    });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`S3 HEAD ${key} failed: HTTP ${String(response.status)}`);
    }
    return true;
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.objectUrl(key), {
      method: 'DELETE',
    });
    if (response.status === 404) return;
    if (!response.ok) {
      throw new Error(
        `S3 DELETE ${key} failed: HTTP ${String(response.status)}`
      );
    }
  }

  async getUri(_key: string): Promise<string | null> {
    return null;
  }

  withPrefix(prefix: string): ObjectStore {
    return new ObjectStoreWithPrefix(this, prefix);
  }
}
