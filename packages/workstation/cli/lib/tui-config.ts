import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { focusSessionPluginPath } from '../../opencode/tui/focus-session';
import type { Platform } from './platform/types';

export type TuiPluginSyncStatus = 'created' | 'updated' | 'unchanged';

/** `~/.config/opencode/tui.json` — TUI plugin registration lives here. */
export function tuiConfigPath(platform: Platform): string {
  return join(platform.opencodeDir(), 'tui.json');
}

/**
 * Ensure the focus-session TUI plugin is registered in tui.json.
 *
 * Merges with any existing file (theme, keybinds, other plugins are
 * preserved); creates `{ $schema, plugin }` when missing. Throws an
 * actionable error on malformed JSON rather than clobbering it — the same
 * convention as the opencode.json sync.
 */
export function ensureTuiPlugin(
  platform: Platform,
  workstationRoot: string
): { path: string; status: TuiPluginSyncStatus } {
  const path = tuiConfigPath(platform);
  const spec = focusSessionPluginPath(workstationRoot);
  const raw = readTuiConfigRaw(path);
  if (raw === undefined) {
    mkdirSync(platform.opencodeDir(), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ $schema: 'https://opencode.ai/tui.json', plugin: [spec] }, null, 2)}\n`
    );
    return { path, status: 'created' };
  }
  const config = parseTuiConfig(path, raw);
  if (!mergePluginSpec(config, spec)) return { path, status: 'unchanged' };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return { path, status: 'updated' };
}

function isEnoent(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}

/**
 * Raw tui.json text, or undefined when the file is missing. Anything else
 * unreadable surfaces as malformed — never silently replaced.
 */
function readTuiConfigRaw(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return undefined;
    throw new Error(
      `Refusing to overwrite malformed ${path}: move or fix it, then run \`ws sync\`.`
    );
  }
}

function parseTuiConfig(path: string, raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      `Refusing to overwrite malformed ${path}: move or fix it, then run \`ws sync\`.`
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Refusing to overwrite malformed ${path}: move or fix it, then run \`ws sync\`.`
    );
  }
  return parsed as Record<string, unknown>;
}

/** Add the plugin spec when absent. Returns false when already registered. */
function mergePluginSpec(
  config: Record<string, unknown>,
  spec: string
): boolean {
  const plugin: unknown = config['plugin'];
  if (Array.isArray(plugin) && plugin.includes(spec)) return false;
  const rest = Array.isArray(plugin)
    ? plugin.filter((entry: unknown) => typeof entry === 'string')
    : [];
  config['plugin'] = [...rest, spec];
  return true;
}

/** True when tui.json registers the focus-session plugin. Pure read. */
export function isTuiPluginRegistered(
  platform: Platform,
  workstationRoot: string
): boolean {
  try {
    const raw = readFileSync(tuiConfigPath(platform), 'utf8');
    const parsed = JSON.parse(raw) as { plugin?: unknown };
    return (
      Array.isArray(parsed.plugin) &&
      parsed.plugin.includes(focusSessionPluginPath(workstationRoot))
    );
  } catch {
    return false;
  }
}
