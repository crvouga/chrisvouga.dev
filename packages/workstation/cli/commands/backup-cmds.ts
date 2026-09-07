import { existsSync, unlinkSync } from 'node:fs';

import type { GlobalOpts } from '../lib/cli-opts';
import { confirmOrThrow } from '../lib/cli-opts';
import { backupOpencodeConfig, listBackups } from '../lib/backup';
import { currentPlatform } from '../lib/platform/index';
import {
  muted,
  printJson,
  printOk,
  resolveOutputMode,
  section,
} from '../lib/output-and-theme';

export async function cmdBackup(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const result = backupOpencodeConfig(platform);
  if (mode === 'json') {
    printJson({ ok: true, ...result });
    return;
  }
  const files = result.files.join(', ') || 'nothing';
  printOk(`Backed up ${files} → ${result.dir}`);
}

export async function cmdBackups(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const backups = listBackups(platform);
  if (mode === 'json') {
    printJson({ ok: true, backups });
    return;
  }
  section('Backups', `${platform.opencodeDir()}/.ws-backup`);
  for (const b of backups) console.log(`  ${b}`);
  if (backups.length === 0) console.log(`  ${muted('none')}`);
}

export async function cmdReset(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  await confirmOrThrow(
    'Reset opencode.json?',
    'Backs up then removes the generated config. Vault keys are untouched.',
    opts
  );
  const backup = backupOpencodeConfig(platform);
  const path = `${platform.opencodeDir()}/opencode.json`;
  if (existsSync(path)) unlinkSync(path);
  if (mode === 'json') {
    printJson({ ok: true, backup, removed: path });
    return;
  }
  printOk(`Reset (backup at ${backup.dir}, removed ${path})`);
}
