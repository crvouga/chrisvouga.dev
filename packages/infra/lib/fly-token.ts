import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "@pkgs/assert";

const DEFAULT_CACHE_FILE = join(import.meta.dirname, "..", ".fly-token");

export function flyTokenCachePath(): string {
  const path = process.env.FLY_TOKEN_CACHE_FILE?.trim() || DEFAULT_CACHE_FILE;
  assert.nonEmptyString(path, "fly token cache path must be non-empty");
  return path;
}

/** Read locally cached Fly deploy token (gitignored `.fly-token`). */
export function readFlyTokenCache(): string | null {
  const path = flyTokenCachePath();
  assert.nonEmptyString(path, "fly token cache path must be non-empty");
  if (!existsSync(path)) return null;
  const token = readFileSync(path, "utf8").trim();
  assert.string(token, "cached fly token must be a string");
  const result = token || null;
  assert.ok(result === null || result.length > 0, "cached fly token must be null or non-empty");
  return result;
}

export function writeFlyTokenCache(token: string): void {
  assert.nonEmptyString(token, "fly token must be non-empty");
  const path = flyTokenCachePath();
  assert.nonEmptyString(path, "fly token cache path must be non-empty");
  writeFileSync(path, `${token.trim()}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms that restrict chmod
  }
}

/** FLY_API_TOKEN → FLY_TOKEN env → `.fly-token` cache. */
export function resolveFlyApiToken(): string | null {
  const token =
    process.env.FLY_API_TOKEN?.trim() ||
    process.env.FLY_TOKEN?.trim() ||
    readFlyTokenCache();
  assert.ok(token === null || token.length > 0, "resolved fly token must be null or non-empty");
  return token || null;
}

export function requireFlyApiToken(): string {
  const token = resolveFlyApiToken();
  if (!token) {
    throw new Error(
      "Fly API token required.\n" +
      "  bun run seed-fly-token --mint\n" +
      "  export FLY_API_TOKEN=...\n" +
      "  or write token to .fly-token (gitignored)",
    );
  }
  assert.nonEmptyString(token, "fly api token must be non-empty after friendly check");
  process.env.FLY_API_TOKEN = token;
  if (!process.env.FLY_TOKEN?.trim()) {
    process.env.FLY_TOKEN = token;
  }
  return token;
}
