import { Assert, ThrowingCrashHandler } from '@pkgs/assert';
import { createLogger } from '@pkgs/logger';

import { CacheBootManager } from './cache/boot-manager';
import { readCacheServerEnv, type CacheServerEnv } from './config/env';

Assert.registerCrashHandler(new ThrowingCrashHandler());

const log = createLogger({ name: 'turbo-cache' });

const ERROR_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
} as const;

function preflightResponse(request: Request): Response {
  const requested = request.headers.get('Access-Control-Request-Headers');
  const allowHeaders =
    requested !== null && requested.trim().length > 0
      ? requested
      : 'Authorization, Content-Type, x-artifact-tag';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': allowHeaders,
    },
  });
}

function fatalConfigResponse(reason: string): Response {
  return new Response(
    JSON.stringify({ error: 'cache misconfigured', reason }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...ERROR_CORS_HEADERS,
      },
    }
  );
}

function internalErrorResponse(): Response {
  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...ERROR_CORS_HEADERS,
    },
  });
}

function healthResponse(method: string): Response | null {
  if (method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { ...ERROR_CORS_HEADERS },
    });
  }
  if (method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok' as const }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...ERROR_CORS_HEADERS,
      },
    });
  }
  return null;
}

export function createCacheRequestHandler(env: CacheServerEnv): {
  fetch: (request: Request) => Promise<Response>;
} {
  const boot = new CacheBootManager(env);

  async function fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/health') {
        const response = healthResponse(request.method);
        if (response !== null) return response;
      }

      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }

      const app = await boot.ensureApp();
      if (app === null) {
        return fatalConfigResponse(boot.fatalReason() ?? 'unknown');
      }

      return app.fetch(request);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('top-level handler error', { error: message });

      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }

      return internalErrorResponse();
    }
  }

  return { fetch };
}

export async function startServer(
  env: CacheServerEnv = readCacheServerEnv()
): Promise<void> {
  const handler = createCacheRequestHandler(env);

  log.info('cache server listening', {
    port: env.PORT,
    vaultConfig: env.VAULT_CONFIG ?? 'dev',
  });

  Bun.serve({
    hostname: '0.0.0.0',
    port: env.PORT,
    fetch: (request) => handler.fetch(request),
  });
}

if (import.meta.main) {
  startServer().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error('cache server failed to start', { error: message });
    process.exit(1);
  });
}
