import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { VaultSecretStore } from '@pkgs/secret-store';
import { VaultCli } from '@pkgs/vault';

import type { Platform } from './platform/types';
import { resolveVaultConfig } from './vault-config';

export type ModelEntry = {
  /** OpenRouter-style catalog id, e.g. `anthropic/claude-opus-4-1`. */
  id: string;
  name: string;
};

export type CatalogSource = 'live' | 'cache' | 'cache-stale' | 'curated';

export type ModelCatalog = {
  models: ModelEntry[];
  source: CatalogSource;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

function cachePath(platform: Platform): string {
  return join(platform.cacheDir(), 'ws-models.json');
}

/**
 * Map a catalog id to the opencode `provider/model-id` reference.
 *
 * When the id's provider is connected locally the bare id works
 * (`anthropic/…`); otherwise route through OpenRouter (`openrouter/<id>`),
 * which serves every catalog model. Ids without a slash pass through.
 */
export function resolveModelRef(
  id: string,
  connectedProviders: readonly string[]
): string {
  const slash = id.indexOf('/');
  if (slash === -1) return id;
  const provider = id.slice(0, slash);
  // `openrouter/…` catalog ids always need the provider prefix
  // (`openrouter/openrouter/auto`), otherwise the bare id would address a
  // non-existent `auto` model on the openrouter provider.
  if (provider === 'openrouter') return `openrouter/${id}`;
  if (connectedProviders.includes(provider)) return id;
  return `openrouter/${id}`;
}

/** Multi-token case-insensitive match over `name + id`. Pure — tested. */
export function filterModels(
  models: readonly ModelEntry[],
  term: string
): ModelEntry[] {
  const tokens = term
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return [...models];
  return models.filter((m) => {
    const hay = `${m.name} ${m.id}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

/**
 * Last-resort list used when the live catalog and the cache are both
 * unavailable. The live OpenRouter catalog is authoritative — this only
 * keeps the picker usable offline.
 */
export function curatedFallbackModels(): ModelEntry[] {
  return [
    { id: 'openrouter/auto', name: 'OpenRouter Auto (routing)' },
    { id: 'anthropic/claude-opus-4-1', name: 'Claude Opus 4.1' },
    { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'openai/gpt-5', name: 'GPT-5' },
    { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'xai/grok-4', name: 'Grok 4' },
  ];
}

function isFresh(fetchedAt: string, now: number = Date.now()): boolean {
  const time = Date.parse(fetchedAt);
  if (Number.isNaN(time)) return false;
  return now - time < CACHE_TTL_MS;
}

function readCache(
  platform: Platform
): { fetchedAt: string; models: ModelEntry[] } | null {
  const path = cachePath(platform);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      fetchedAt?: unknown;
      models?: unknown;
    };
    if (typeof parsed.fetchedAt !== 'string') return null;
    if (!Array.isArray(parsed.models)) return null;
    const models = parsed.models.filter(
      (m): m is ModelEntry =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as { id?: unknown }).id === 'string' &&
        typeof (m as { name?: unknown }).name === 'string'
    );
    return { fetchedAt: parsed.fetchedAt, models };
  } catch {
    return null;
  }
}

function writeCache(platform: Platform, models: ModelEntry[]): void {
  try {
    const path = cachePath(platform);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ fetchedAt: new Date().toISOString(), models }, null, 2)}\n`
    );
  } catch {
    // Cache is best-effort.
  }
}

/** Best-effort OpenRouter API key from Vault (null when unavailable). */
async function vaultApiKey(): Promise<string | null> {
  try {
    const vault = resolveVaultConfig();
    const token = new VaultCli({ addr: vault.addr }).resolveToken().token;
    const store = new VaultSecretStore({
      token,
      addr: vault.addr,
      mount: vault.mount,
      project: vault.project,
      config: vault.config,
    });
    const secret = await store.getOptional('OPENROUTER_API_KEY');
    return secret === null ? null : secret.readSecretValue();
  } catch {
    return null;
  }
}

function parseCatalogItems(data: unknown): ModelEntry[] | null {
  if (!Array.isArray(data)) return null;
  const models: ModelEntry[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as { id?: unknown; name?: unknown };
    if (typeof record.id !== 'string' || typeof record.name !== 'string') {
      continue;
    }
    // `~`-prefixed ids are unlisted/hidden on OpenRouter — not selectable.
    if (record.id.length === 0 || record.id.startsWith('~')) continue;
    models.push({ id: record.id, name: record.name });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models.length > 0 ? models : null;
}

async function fetchWithTimeout(key: string | null): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      signal: controller.signal,
      headers: key !== null ? { Authorization: `Bearer ${key}` } : {},
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: unknown };
    return body.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveCatalog(): Promise<ModelEntry[] | null> {
  try {
    const data = await fetchWithTimeout(await vaultApiKey());
    return parseCatalogItems(data);
  } catch {
    return null;
  }
}

/**
 * Resolve the model catalog: fresh cache → live fetch → stale cache →
 * curated fallback. Never throws — the picker always has something to show.
 */
export async function resolveModelCatalog(
  platform: Platform,
  opts?: { refresh?: boolean | undefined }
): Promise<ModelCatalog> {
  const cached = readCache(platform);
  if (opts?.refresh !== true && cached !== null && isFresh(cached.fetchedAt)) {
    return { models: cached.models, source: 'cache' };
  }
  const live = await fetchLiveCatalog();
  if (live !== null) {
    writeCache(platform, live);
    return { models: live, source: 'live' };
  }
  if (cached !== null && cached.models.length > 0) {
    return { models: cached.models, source: 'cache-stale' };
  }
  return { models: curatedFallbackModels(), source: 'curated' };
}
