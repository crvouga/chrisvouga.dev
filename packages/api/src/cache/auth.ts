import { assert, hotAssert, type Assert } from '@pkgs/assert';

const ha: Assert = hotAssert();
import type { Context, MiddlewareHandler } from 'hono';

const BEARER_PREFIX = 'Bearer ';

export function createBearerAuthMiddleware(
  expectedToken: string
): MiddlewareHandler {
  assert.nonEmptyString(expectedToken, 'auth middleware requires token');
  return async (c, next) => {
    ha.defined(c, 'auth handler requires context');
    const header = c.req.header('Authorization');
    if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
      return unauthorized(c);
    }
    ha.string(header, 'authorization header must be string');
    const token = header.slice(BEARER_PREFIX.length).trim();
    if (token.length === 0 || token !== expectedToken) {
      return unauthorized(c);
    }
    return await next();
  };
}

function unauthorized(c: Context): Response {
  assert.defined(c, 'unauthorized requires context');
  return c.json({ error: 'unauthorized' }, 401);
}
