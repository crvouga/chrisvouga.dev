import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { vaultKvGetConfig } from "./vault-kv.js";

const DEFAULT_CACHE_FILE = join(import.meta.dirname, "..", ".railway-token");

export function railwayTokenCachePath(): string {
  return process.env.RAILWAY_TOKEN_CACHE_FILE?.trim() || DEFAULT_CACHE_FILE;
}

export function readRailwayTokenCache(): string | null {
  const path = railwayTokenCachePath();
  if (!existsSync(path)) return null;
  const token = readFileSync(path, "utf8").trim();
  return token || null;
}

export function writeRailwayTokenCache(token: string): void {
  const path = railwayTokenCachePath();
  writeFileSync(path, `${token.trim()}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms that restrict chmod
  }
}

/** RAILWAY_TOKEN env → `.railway-token` cache. */
export function resolveRailwayToken(): string | null {
  return process.env.RAILWAY_TOKEN?.trim() || readRailwayTokenCache();
}

export function requireRailwayToken(): string {
  const token = resolveRailwayToken();
  if (!token) {
    throw new Error(railwayTokenHelp());
  }
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
    const token = data.RAILWAY_TOKEN?.trim();
    if (token) {
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
      const token = data.RAILWAY_TOKEN?.trim();
      if (token) {
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
