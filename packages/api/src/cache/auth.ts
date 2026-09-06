import type { Context, MiddlewareHandler } from 'hono';

const BEARER_PREFIX = 'Bearer ';

export function createBearerAuthMiddleware(
  expectedToken: string
): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
      return unauthorized(c);
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    if (token.length === 0 || token !== expectedToken) {
      return unauthorized(c);
    }
    return await next();
  };
}

function unauthorized(c: Context): Response {
  return c.json({ error: 'unauthorized' }, 401);
}
