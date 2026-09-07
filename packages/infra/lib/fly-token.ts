import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_CACHE_FILE = join(import.meta.dirname, "..", ".fly-token");

export function flyTokenCachePath(): string {
  return process.env.FLY_TOKEN_CACHE_FILE?.trim() || DEFAULT_CACHE_FILE;
}

/** Read locally cached Fly deploy token (gitignored `.fly-token`). */
export function readFlyTokenCache(): string | null {
  const path = flyTokenCachePath();
  if (!existsSync(path)) return null;
  const token = readFileSync(path, "utf8").trim();
  return token || null;
}

export function writeFlyTokenCache(token: string): void {
  const path = flyTokenCachePath();
  writeFileSync(path, `${token.trim()}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms that restrict chmod
  }
}

/** FLY_API_TOKEN → FLY_TOKEN env → `.fly-token` cache. */
export function resolveFlyApiToken(): string | null {
  return (
    process.env.FLY_API_TOKEN?.trim() ||
    process.env.FLY_TOKEN?.trim() ||
    readFlyTokenCache()
  );
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
  process.env.FLY_API_TOKEN = token;
  if (!process.env.FLY_TOKEN?.trim()) {
    process.env.FLY_TOKEN = token;
  }
  return token;
}
