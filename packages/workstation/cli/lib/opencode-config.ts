import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { AUTO_ROUTER_MODEL_REFERENCE } from '@pkgs/openrouter';

import type { Platform } from './platform/types';

export const OPENCODE_SCHEMA = 'https://opencode.ai/config.json';

export type OpencodeConfig = Record<string, unknown>;

export function configPath(platform: Platform): string {
  return `${platform.opencodeDir()}/opencode.json`;
}

export function loadConfig(platform: Platform): OpencodeConfig {
  const path = configPath(platform);
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  if (raw.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Refusing to read non-JSON config at ${path} (${msg}). Move or fix it, then re-run.`
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Refusing to read non-object config at ${path}.`);
  }
  return parsed as OpencodeConfig;
}

/** Merge-write preserving unrelated keys; always 0600. Refuses non-JSON. */
export function writeConfig(
  platform: Platform,
  config: OpencodeConfig
): string {
  const path = configPath(platform);
  if (existsSync(path)) {
    // Re-validate before clobbering.
    loadConfig(platform);
  }
  const json = `${JSON.stringify(config, null, 2)}\n`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, json, { mode: 0o600 });
  return path;
}

function providerSection(config: OpencodeConfig): Record<string, unknown> {
  const section = config['provider'];
  if (
    section !== null &&
    typeof section === 'object' &&
    !Array.isArray(section)
  ) {
    return section as Record<string, unknown>;
  }
  return {};
}

export function listProviders(config: OpencodeConfig): string[] {
  return Object.keys(providerSection(config)).sort();
}

export function hasProvider(config: OpencodeConfig, id: string): boolean {
  return Object.hasOwn(providerSection(config), id);
}

export function removeProvider(
  config: OpencodeConfig,
  id: string
): { updated: OpencodeConfig; removed: boolean } {
  const section = providerSection(config);
  if (!Object.hasOwn(section, id)) return { updated: config, removed: false };
  const next = { ...section };
  delete next[id];
  return { updated: { ...config, provider: next }, removed: true };
}

export function getModel(config: OpencodeConfig): string | null {
  const model = config['model'];
  return typeof model === 'string' ? model : null;
}

export function getSmallModel(config: OpencodeConfig): string | null {
  const small = config['small_model'];
  return typeof small === 'string' ? small : null;
}

/** Task-model slots managed by `ws opencode set-model`. */
export const MODEL_SLOTS = ['build_model', 'plan_model'] as const;

export type ModelSlot = (typeof MODEL_SLOTS)[number];

export function getModelSlot(
  config: OpencodeConfig,
  slot: ModelSlot
): string | null {
  const value = config[slot];
  return typeof value === 'string' ? value : null;
}

/** Set (or clear with null) the build/plan model slots. */
export function setModelSlots(
  config: OpencodeConfig,
  slots: Record<ModelSlot, string | null>
): OpencodeConfig {
  const next: OpencodeConfig = { ...config };
  for (const slot of MODEL_SLOTS) {
    const value = slots[slot];
    if (value !== null) {
      next[slot] = value;
    } else {
      delete next[slot];
    }
  }
  return next;
}

export function setModel(
  config: OpencodeConfig,
  model: string | null,
  smallModel: string | null
): OpencodeConfig {
  const next: OpencodeConfig = { ...config };
  if (model !== null) {
    next['model'] = model;
  } else {
    delete next['model'];
  }
  if (smallModel !== null) {
    next['small_model'] = smallModel;
  } else {
    delete next['small_model'];
  }
  return next;
}

/** Ensure the OpenRouter Auto Router defaults (only when unset). */
export function ensureAutoRouterDefaults(
  config: OpencodeConfig
): OpencodeConfig {
  if (!hasProvider(config, 'openrouter')) return config;
  const next: OpencodeConfig = { ...config };
  if (typeof next['model'] !== 'string') {
    next['model'] = AUTO_ROUTER_MODEL_REFERENCE;
  }
  if (typeof next['small_model'] !== 'string') {
    next['small_model'] = AUTO_ROUTER_MODEL_REFERENCE;
  }
  return next;
}

export function ensureSchema(config: OpencodeConfig): OpencodeConfig {
  if (config['$schema'] !== undefined) return config;
  return { ...config, $schema: OPENCODE_SCHEMA };
}
