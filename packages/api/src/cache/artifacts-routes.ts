import { Hono } from 'hono';
import type { ObjectStore } from '@pkgs/object-store/interface';

const ARTIFACT_CONTENT_TYPE = 'application/octet-stream';
const TAG_SUFFIX = '.tag';

function tagKey(hash: string): string {
  return `${hash}${TAG_SUFFIX}`;
}

async function readTag(
  store: ObjectStore,
  hash: string
): Promise<string | null> {
  const stored = await store.get(tagKey(hash));
  if (stored === null) return null;
  const reader = stored.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export function createArtifactsApp(store: ObjectStore): Hono {
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
    const hashes = parseHashList(body);
    const result: Record<string, boolean> = {};
    await Promise.all(
      hashes.map(async (hash) => {
        result[hash] = await store.head(hash);
      })
    );
    return c.json(result);
  });

  app.on('HEAD', '/v8/artifacts/:hash', async (c) => {
    const hash = c.req.param('hash');
    const exists = await store.head(hash);
    return c.body(null, exists ? 200 : 404);
  });

  app.get('/v8/artifacts/:hash', async (c) => {
    const hash = c.req.param('hash');
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

  app.put('/v8/artifacts/:hash', async (c) => {
    const hash = c.req.param('hash');
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    await store.put(hash, bytes, ARTIFACT_CONTENT_TYPE);

    const tag = c.req.header('x-artifact-tag');
    if (tag !== undefined && tag.length > 0) {
      const tagBytes = new TextEncoder().encode(tag);
      await store.put(tagKey(hash), tagBytes, 'text/plain');
    }

    return c.json({ urls: [] as string[] });
  });

  return app;
}

function parseHashList(body: unknown): string[] {
  if (!Array.isArray(body)) {
    throw new Error('POST /v8/artifacts body must be a JSON array of hashes');
  }
  return body.filter((item): item is string => typeof item === 'string');
}
