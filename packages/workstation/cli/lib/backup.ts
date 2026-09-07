import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import type { Platform } from './platform/types';

export function backupDir(platform: Platform): string {
  return join(platform.opencodeDir(), '.ws-backup');
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Copy opencode.json + notifier sounds to a timestamped backup dir. */
export function backupOpencodeConfig(platform: Platform): {
  dir: string;
  files: string[];
} {
  const dir = join(backupDir(platform), stamp());
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (const name of ['opencode.json', 'notifier-sounds.json']) {
    const src = join(platform.opencodeDir(), name);
    if (!existsSync(src)) continue;
    try {
      if (!statSync(src).isFile()) continue;
    } catch {
      continue;
    }
    copyFileSync(src, join(dir, name));
    files.push(name);
  }
  return { dir, files };
}

export function listBackups(platform: Platform): string[] {
  const base = backupDir(platform);
  if (!existsSync(base)) return [];
  try {
    return readdirSync(base).sort().reverse();
  } catch {
    return [];
  }
}
