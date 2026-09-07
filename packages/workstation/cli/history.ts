import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { currentPlatform } from './lib/platform/index';

const MAX_HISTORY = 8;

function historyPath(): string {
  return join(currentPlatform().cacheDir(), 'ws-history.json');
}

export function loadHistory(): string[] {
  try {
    if (!existsSync(historyPath())) return [];
    const parsed = JSON.parse(readFileSync(historyPath(), 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export function pushHistory(id: string): void {
  try {
    const path = historyPath();
    mkdirSync(join(path, '..'), { recursive: true });
    const next = [id, ...loadHistory().filter((h) => h !== id)].slice(
      0,
      MAX_HISTORY
    );
    writeFileSync(path, `${JSON.stringify(next)}\n`);
  } catch {
    // History is best-effort.
  }
}
