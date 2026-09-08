import { assert, hotAssert, type Assert } from '@pkgs/assert';
import { Hono } from 'hono';
import type { ObjectStore } from '@pkgs/object-store/interface';

const ha: Assert = hotAssert();

const ARTIFACT_CONTENT_TYPE = 'application/octet-stream';
const TAG_SUFFIX = '.tag';

function tagKey(hash: string): string {
  assert.nonEmptyString(hash, 'tagKey requires non-empty hash');
  return `${hash}${TAG_SUFFIX}`;
}

async function readTag(
  store: ObjectStore,
  hash: string
): Promise<string | null> {
  assert.defined(store, 'readTag requires object store');
  assert.nonEmptyString(hash, 'readTag requires non-empty hash');
  const stored = await store.get(tagKey(hash));
  if (stored === null) return null;
  assert.defined(stored.body, 'readTag requires stored body');
  const reader = stored.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      ha.nonNegative(value.byteLength, 'tag chunk byteLength >= 0');
      chunks.push(value);
      total += value.byteLength;
    }
  }
  assert.nonNegativeInteger(total, 'tag total bytes must be non-negative');
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    ha.ok(
      offset >= 0 && offset + chunk.byteLength <= total,
      'tag chunk offset within bounds'
    );
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  ha.equals(offset, total, 'tag merge offset equals total');
  ha.equals(merged.length, total, 'tag merged length equals total');
  return new TextDecoder().decode(merged);
}

export function createArtifactsApp(store: ObjectStore): Hono {
  assert.defined(store, 'createArtifactsApp requires object store');
  const app = new Hono();

  app.get('/v8/artifacts/status', (c) =>
    c.json({ status: 'enabled' as const })
  );

  app.post('/v8/artifacts/events', async (c) => {
    await c.req.arrayBuffer();
    return c.body(null, 200);
  });

  app.post('/v8/artifacts', async (c) => {
    const body = await c.req.json<unknown>();
    assert.defined(body, 'POST /v8/artifacts requires JSON body');
    const hashes = parseHashList(body);
    assert.array(hashes, 'POST /v8/artifacts hashes must be an array');
    const result: Record<string, boolean> = {};
    await Promise.all(
      hashes.map(async (hash) => {
        ha.nonEmptyString(hash, 'batch hash must be non-empty');
        result[hash] = await store.head(hash);
      })
    );
    return c.json(result);
  });

  app.on('HEAD', '/v8/artifacts/:hash', async (c) => {
    const hash = c.req.param('hash');
    assert.nonEmptyString(hash, 'HEAD /v8/artifacts requires non-empty hash');
    assert.defined(store, 'HEAD handler requires object store');
    const exists = await store.head(hash);
    if (exists) return c.body(null, 200);
    assert.ok(!exists, 'HEAD miss returns 404');
    return c.body(null, 404);
  });

  registerDownloadRoute(app, store);
  registerUploadRoute(app, store);

  return app;
}

function registerDownloadRoute(app: Hono, store: ObjectStore): void {
  assert.defined(app, 'registerDownloadRoute requires app');
  assert.defined(store, 'registerDownloadRoute requires object store');
  app.get('/v8/artifacts/:hash', async (c) => {
    const hash = c.req.param('hash');
    assert.nonEmptyString(hash, 'GET /v8/artifacts requires non-empty hash');
    assert.defined(store, 'GET handler requires object store');
    const stored = await store.get(hash);
    if (stored === null) {
      return c.body(null, 404);
    }
    const headers: Record<string, string> = {
      'Content-Type': stored.contentType || ARTIFACT_CONTENT_TYPE,
    };
    const tag = await readTag(store, hash);
    if (tag !== null) {
      headers['x-artifact-tag'] = tag;
    }
    return new Response(stored.body, { status: 200, headers });
  });
}

function registerUploadRoute(app: Hono, store: ObjectStore): void {
  assert.defined(app, 'registerUploadRoute requires app');
  assert.defined(store, 'registerUploadRoute requires object store');
  app.put('/v8/artifacts/:hash', async (c) => {
    const hash = c.req.param('hash');
    assert.nonEmptyString(hash, 'PUT /v8/artifacts requires non-empty hash');
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    assert.instanceOf(bytes, Uint8Array, 'PUT body must be bytes');
    assert.nonNegativeInteger(
      bytes.byteLength,
      'PUT body byteLength must be non-negative'
    );
    await store.put(hash, bytes, ARTIFACT_CONTENT_TYPE);
    assert.equals(
      ARTIFACT_CONTENT_TYPE,
      'application/octet-stream',
      'artifact content type invariant'
    );

    const tag = c.req.header('x-artifact-tag');
    if (tag !== undefined && tag.length > 0) {
      const tagBytes = new TextEncoder().encode(tag);
      await store.put(tagKey(hash), tagBytes, 'text/plain');
    }

    return c.json({ urls: [] as string[] });
  });
}

function parseHashList(body: unknown): string[] {
  assert.defined(body, 'POST /v8/artifacts body must be defined');
  if (!Array.isArray(body)) {
    throw new Error('POST /v8/artifacts body must be a JSON array of hashes');
  }
  const result = body.filter(
    (item): item is string => typeof item === 'string'
  );
  assert.array(result, 'parseHashList result must be an array');
  return result;
}
