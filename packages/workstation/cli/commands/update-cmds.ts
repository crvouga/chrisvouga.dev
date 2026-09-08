import { spawnSync } from 'node:child_process';

import { cmdInstall } from './install-cmds';
import { converge } from './sync';
import type { GlobalOpts } from '../lib/cli-opts';
import { installGlobalLauncher, pathExportLine } from '../lib/global-install';
import { currentPlatform } from '../lib/platform/index';
import { workstationRoot, workspaceRoot } from '../lib/paths';
import {
  printJson,
  printOk,
  printWarn,
  resolveOutputMode,
  startSpinner,
} from '../lib/output-and-theme';
import { pullFastForwardOnly } from '../lib/repo-update';

/**
 * `ws update` — pull the workspace checkout to the latest upstream
 * (GitHub), refresh dependencies, then reinstall the launcher + sync.
 * Refuses to pull with uncommitted changes (see `repo-update.ts`).
 */
export async function cmdUpdate(opts: GlobalOpts): Promise<void> {
  const mode = resolveOutputMode(opts.json);
  const platform = currentPlatform();
  const root = workspaceRoot();

  const pullSpinner = startSpinner('Pulling latest workspace…', mode);
  const pull = pullFastForwardOnly(root);
  pullSpinner?.succeed(
    pull.updated
      ? `Pulled ${pull.before} → ${pull.after}`
      : `Already up to date (${pull.after})`
  );

  const installSpinner = startSpinner('Installing dependencies…', mode);
  runBunInstall(root);
  installSpinner?.succeed('Dependencies installed');

  if (mode === 'json') {
    // Same pieces as `cmdInstall`, plus the pull result, in one payload.
    const launcher = installGlobalLauncher(workstationRoot(), platform);
    const syncResult = await converge(platform);
    const firstRc = platform.shellRcFiles()[0] ?? '~/.profile';
    printJson({
      ok: true,
      before: pull.before,
      after: pull.after,
      updated: pull.updated,
      launcher,
      pathHint: launcher.alreadyOnPath
        ? null
        : `Add to PATH: ${pathExportLine(launcher.binDir, firstRc)}`,
      sync: syncResult,
    });
    return;
  }
  if (pull.updated) printOk(`Updated ${pull.before} → ${pull.after}`);
  else printWarn(`Already up to date (${pull.after})`);
  await cmdInstall(opts);
}

function runBunInstall(root: string): void {
  const proc = spawnSync('bun', ['install'], { cwd: root, encoding: 'utf8' });
  if (proc.status !== 0) {
    const detail = `${proc.stderr ?? ''}${proc.stdout ?? ''}`.trim();
    throw new Error(
      `bun install failed after pull${detail.length > 0 ? `:\n${detail}` : ''}\nResolve it manually, then run \`ws install\`.`
    );
  }
}
