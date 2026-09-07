import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import type { GlobalInstallResult, Platform } from './platform/types';

export const WS_BIN_NAME = 'ws';

/**
 * Launcher shim: execs the checked-in CLI via bun so `ws` always runs the
 * latest repo source. Overwrites any previous `ws` launcher (idempotent).
 */
export function launcherShellScript(workstationRoot: string): string {
  const entry = join(workstationRoot, 'cli/index.ts');
  return `#!/bin/sh
# Managed by \`ws install\` — do not edit. Re-run \`ws install\` to update.
exec bun "${entry}" "$@"
`;
}

export function launcherCmdScript(workstationRoot: string): string {
  const entry = join(workstationRoot, 'cli/index.ts');
  return `@echo off\r\nrem Managed by \`ws install\` - do not edit.\r\nbun "${entry}" %*\r\n`;
}

/** Install (or overwrite) the global `ws` launcher. Never touches anything else. */
export function installGlobalLauncher(
  workstationRoot: string,
  platform: Platform
): GlobalInstallResult {
  const binDir = platform.globalBinDir();
  mkdirSync(binDir, { recursive: true });
  const alreadyOnPath = isOnPath(binDir);

  if (platform.name === 'windows') {
    const cmdPath = join(binDir, `${WS_BIN_NAME}.cmd`);
    const existed = existsSync(cmdPath);
    writeFileSync(cmdPath, launcherCmdScript(workstationRoot));
    return {
      binDir,
      launcherPath: cmdPath,
      created: !existed,
      alreadyOnPath,
    };
  }

  const launcherPath = join(binDir, WS_BIN_NAME);
  const existed = existsSync(launcherPath);
  writeFileSync(launcherPath, launcherShellScript(workstationRoot), {
    mode: 0o755,
  });
  chmodSync(launcherPath, 0o755);
  return { binDir, launcherPath, created: !existed, alreadyOnPath };
}

export function globalLauncherPath(platform: Platform): string {
  return platform.name === 'windows'
    ? join(platform.globalBinDir(), `${WS_BIN_NAME}.cmd`)
    : join(platform.globalBinDir(), WS_BIN_NAME);
}

/** Whether `dir` is on the current process PATH. Pure over inputs — tested. */
export function isOnPath(
  dir: string,
  pathEnv: string = process.env['PATH'] ?? ''
): boolean {
  const sep = process.platform === 'win32' ? ';' : ':';
  return pathEnv.split(sep).some((entry) => entry === dir);
}

/** Shell export line for a given rc file (fish uses a different syntax). */
export function pathExportLine(binDir: string, rcFile: string): string {
  if (rcFile.endsWith('config.fish')) {
    return `fish_add_path "${binDir}"`;
  }
  return `export PATH="${binDir}:$PATH"`;
}
