import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "@pkgs/assert";
import { vaultKvGetConfig } from "./vault-kv.js";

const DEFAULT_CACHE_FILE = join(import.meta.dirname, "..", ".railway-token");

export function railwayTokenCachePath(): string {
  const path = process.env.RAILWAY_TOKEN_CACHE_FILE?.trim() || DEFAULT_CACHE_FILE;
  assert.nonEmptyString(path, "railway token cache path must be non-empty");
  return path;
}

export function readRailwayTokenCache(): string | null {
  const path = railwayTokenCachePath();
  assert.nonEmptyString(path, "railway token cache path must be non-empty");
  if (!existsSync(path)) return null;
  const token = readFileSync(path, "utf8").trim();
  assert.string(token, "cached railway token must be a string");
  const result = token || null;
  assert.ok(result === null || result.length > 0, "cached railway token must be null or non-empty");
  return result;
}

export function writeRailwayTokenCache(token: string): void {
  assert.nonEmptyString(token, "railway token must be non-empty");
  const path = railwayTokenCachePath();
  assert.nonEmptyString(path, "railway token cache path must be non-empty");
  writeFileSync(path, `${token.trim()}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms that restrict chmod
  }
}

/** RAILWAY_TOKEN env → `.railway-token` cache. */
export function resolveRailwayToken(): string | null {
  const token = process.env.RAILWAY_TOKEN?.trim() || readRailwayTokenCache();
  assert.ok(token === null || token.length > 0, "resolved railway token must be null or non-empty");
  return token || null;
}

export function requireRailwayToken(): string {
  const token = resolveRailwayToken();
  if (!token) {
    throw new Error(railwayTokenHelp());
  }
  assert.nonEmptyString(token, "railway token must be non-empty after friendly check");
  process.env.RAILWAY_TOKEN = token;
  return token;
}

function railwayTokenHelp(): string {
  return (
    "Railway API token required.\n" +
    "  export RAILWAY_TOKEN=...\n" +
    "  or write token to .railway-token (gitignored)\n" +
    "  or run after `vault login` (reads secret/personal/prd RAILWAY_TOKEN)\n" +
    "  or use `vault run -- bun run <script>`"
  );
}

/** Resolve token from env, cache, Vault CLI, or VAULT_TOKEN-backed KV read. */
export async function ensureRailwayToken(): Promise<string> {
  const cached = resolveRailwayToken();
  if (cached) {
    process.env.RAILWAY_TOKEN = cached;
    return cached;
  }

  try {
    const { vaultKvGetCli } = await import("./vault-kv.js");
    const data = await vaultKvGetCli();
    assert.record(data, "vault cli data must be a record");
    const token = data.RAILWAY_TOKEN?.trim();
    if (token) {
      assert.nonEmptyString(token, "vault RAILWAY_TOKEN must be non-empty");
      process.env.RAILWAY_TOKEN = token;
      writeRailwayTokenCache(token);
      return token;
    }
  } catch {
    // fall through
  }

  if (process.env.VAULT_TOKEN?.trim()) {
    try {
      const data = await vaultKvGetConfig("prd");
      assert.record(data, "vault prd data must be a record");
      const token = data.RAILWAY_TOKEN?.trim();
      if (token) {
        assert.nonEmptyString(token, "vault RAILWAY_TOKEN must be non-empty");
        process.env.RAILWAY_TOKEN = token;
        writeRailwayTokenCache(token);
        return token;
      }
    } catch {
      // fall through
    }
  }

  throw new Error(railwayTokenHelp());
}
