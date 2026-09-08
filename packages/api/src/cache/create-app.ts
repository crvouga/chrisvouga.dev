import { assert } from '@pkgs/assert';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ObjectStore } from '@pkgs/object-store/interface';

import { createBearerAuthMiddleware } from './auth';
import { createArtifactsApp } from './artifacts-routes';

export type CacheAppConfig = {
  readonly turboToken: string;
  readonly objectStore: ObjectStore;
};

export function createCacheApp(config: CacheAppConfig): Hono {
  assert.record(config, 'createCacheApp requires config');
  assert.nonEmptyString(
    config.turboToken,
    'createCacheApp requires turboToken'
  );
  assert.defined(config.objectStore, 'createCacheApp requires objectStore');
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'x-artifact-tag'],
    })
  );

  app.get('/health', (c) => c.json({ status: 'ok' as const }));

  const artifacts = new Hono();
  artifacts.use('*', createBearerAuthMiddleware(config.turboToken));
  artifacts.route('/', createArtifactsApp(config.objectStore));
  app.route('/', artifacts);

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  });

  assert.defined(app, 'createCacheApp must return app');
  return app;
}
