#!/usr/bin/env bun
/**
 * `bun run ws:install` (repo root) — install the global `ws` launcher and
 * converge the workstation to the checked-in spec.
 *
 * - Installs/overwrites the `ws` launcher on PATH (`~/.local/bin/ws`).
 * - Runs the full converge (links + sounds + notifier + providers).
 * - Idempotent; safe to re-run. Never requires sudo, never touches anything
 *   outside `$HOME` + the launcher dir.
 *
 * Usage:
 *   bun run ws:install [--yes]   # --yes also appends PATH exports to shell RCs
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { converge, type SyncResult } from './commands/sync';
import { installGlobalLauncher, pathExportLine } from './lib/global-install';
import { currentPlatform } from './lib/platform/index';
import type { GlobalInstallResult } from './lib/platform/types';
import { workstationRoot } from './lib/paths';

function appendPathExport(launcher: GlobalInstallResult, line: string): void {
  const platform = currentPlatform();
  let appended = 0;
  for (const rc of platform.shellRcFiles()) {
    try {
      if (!existsSync(rc)) continue;
      if (readFileSync(rc, 'utf8').includes(launcher.binDir)) continue;
      appendFileSync(rc, `\n# Added by \`ws install\`\n${line}\n`);
      appended += 1;
      console.log(`  [path] appended to ${rc}`);
    } catch {
      // Best-effort per RC file.
    }
  }
  if (appended === 0) {
    console.log(`  [path] add to your shell RC manually:\n    ${line}`);
  }
}

function ensurePath(launcher: GlobalInstallResult, yes: boolean): void {
  if (launcher.alreadyOnPath) return;
  const firstRc = currentPlatform().shellRcFiles()[0] ?? '~/.profile';
  const line = pathExportLine(launcher.binDir, firstRc);
  if (yes) {
    appendPathExport(launcher, line);
    return;
  }
  console.log(`  [path] ${launcher.binDir} is not on PATH.`);
  console.log(`    Add it: ${line}`);
  console.log(`    Or re-run with --yes to append automatically.`);
}

function printSyncResult(result: SyncResult): void {
  for (const link of result.links) {
    console.log(`  [${link.status}] ${link.link}`);
  }
  console.log(`  [written] ${result.sounds}`);
  console.log(
    `  [${result.notifier.result}] notifier: ${result.notifier.detail}`
  );
  const suffix =
    result.providers.configPath.length > 0
      ? ` → ${result.providers.configPath}`
      : ' (vault unavailable — skipped)';
  console.log(
    `  connected ${result.providers.connected.length} provider(s)${suffix}`
  );
}

async function main(): Promise<void> {
  const yes = process.argv.includes('--yes');
  const platform = currentPlatform();
  const root = workstationRoot();

  console.log(`ws install (${root})`);
  const launcher = installGlobalLauncher(root, platform);
  console.log(
    `  [${launcher.created ? 'created' : 'updated'}] ${launcher.launcherPath}`
  );
  ensurePath(launcher, yes);
  printSyncResult(await converge(platform));
  console.log('Done. Run `ws` for the interactive dashboard.');
}

main().catch((err: unknown) => {
  console.error(`\nERROR ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
