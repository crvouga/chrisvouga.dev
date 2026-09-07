import { existsSync, unlinkSync } from 'node:fs';

import { converge } from './sync';
import type { GlobalOpts } from '../lib/cli-opts';
import { confirmOrThrow } from '../lib/cli-opts';
import {
  globalLauncherPath,
  installGlobalLauncher,
  pathExportLine,
} from '../lib/global-install';
import { describeLink, managedLinks } from '../lib/links';
import { currentPlatform } from '../lib/platform/index';
import { workstationRoot } from '../lib/paths';
import {
  printJson,
  printOk,
  printWarn,
  resolveOutputMode,
  startSpinner,
} from '../lib/output-and-theme';

type UninstallOpts = GlobalOpts & { removeLinks?: boolean | undefined };

export async function cmdInstall(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const launcher = installGlobalLauncher(workstationRoot(), platform);
  const spinner = startSpinner('Syncing workstation…', mode);
  const syncResult = await converge(platform);
  spinner?.succeed('Installed');
  const firstRc = platform.shellRcFiles()[0] ?? '~/.profile';
  const pathHint = launcher.alreadyOnPath
    ? null
    : `Add to PATH: ${pathExportLine(launcher.binDir, firstRc)}`;
  if (mode === 'json') {
    printJson({ ok: true, launcher, pathHint, sync: syncResult });
    return;
  }
  const verb = launcher.created ? 'Installed' : 'Updated';
  printOk(`${verb} ${launcher.launcherPath}`);
  if (pathHint !== null) printWarn(pathHint);
  console.log(
    `  synced ${syncResult.links.length} link(s), ${syncResult.providers.connected.length} provider(s)`
  );
}

export async function cmdUninstall(opts: UninstallOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  await confirmOrThrow(
    'Uninstall ws launcher?',
    `Removes ${globalLauncherPath(platform)}. Managed opencode config is left in place.`,
    opts
  );
  const launcher = globalLauncherPath(platform);
  const existed = existsSync(launcher);
  if (existed) unlinkSync(launcher);
  const removedLinks = removeLinks(platform, opts.removeLinks === true);
  if (mode === 'json') {
    printJson({ ok: true, removed: existed ? launcher : null, removedLinks });
    return;
  }
  printOk(existed ? `Removed ${launcher}` : 'Launcher was not installed');
}

function removeLinks(
  platform: ReturnType<typeof currentPlatform>,
  enabled: boolean
): string[] {
  if (!enabled) return [];
  const removed: string[] = [];
  for (const link of managedLinks(workstationRoot(), platform)) {
    if (describeLink(link).state === 'ok') {
      unlinkSync(link.link);
      removed.push(link.link);
    }
  }
  return removed;
}
