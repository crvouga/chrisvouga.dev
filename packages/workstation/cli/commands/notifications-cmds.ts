import { existsSync, unlinkSync } from 'node:fs';

import type { GlobalOpts } from '../lib/cli-opts';
import { confirmOrThrow } from '../lib/cli-opts';
import { describeLink, ensureLink, managedLinks } from '../lib/links';
import { writeSoundConfig } from '../lib/notifier-build';
import { currentPlatform } from '../lib/platform/index';
import type { NotificationKind } from '../lib/platform/types';
import { workstationRoot } from '../lib/paths';
import {
  muted,
  printFail,
  printJson,
  printOk,
  resolveOutputMode,
  section,
} from '../lib/output-and-theme';

const KINDS: NotificationKind[] = [
  'finished',
  'question',
  'permission',
  'error',
];

function pluginLink(): { link: string; target: string; label: string } {
  const plugin = managedLinks(workstationRoot(), currentPlatform()).find((l) =>
    l.label.includes('notification plugin')
  );
  if (plugin === undefined) {
    throw new Error('Plugin link not defined for this platform.');
  }
  return plugin;
}

export async function cmdNotificationsStatus(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const plugin = pluginLink();
  const state = describeLink(plugin).state;
  const caps = platform.notifierCapabilities();
  const payload = {
    enabled: state === 'ok',
    pluginState: state,
    daemonRunning: platform.isNotifierDaemonRunning(),
    capabilities: caps,
    soundsPath: `${platform.opencodeDir()}/notifier-sounds.json`,
  };
  if (mode === 'json') {
    printJson({ ok: true, ...payload });
    return;
  }
  section('Notifications', payload.enabled ? 'enabled' : 'disabled');
  console.log(`  plugin: ${muted(state)}`);
  const daemon = payload.daemonRunning ? 'running' : 'idle';
  console.log(`  daemon: ${muted(daemon)}`);
  if (caps.reason !== undefined) console.log(`  ${muted(caps.reason)}`);
}

export async function cmdNotificationsEnable(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const plugin = pluginLink();
  const status = ensureLink(plugin);
  writeSoundConfig(platform);
  if (mode === 'json') {
    printJson({ ok: true, plugin: plugin.link, status });
    return;
  }
  printOk(`Notifications enabled [${status}] ${plugin.link}`);
}

export async function cmdNotificationsDisable(opts: GlobalOpts): Promise<void> {
  const mode = resolveOutputMode(opts.json);
  const plugin = pluginLink();
  await confirmOrThrow(
    'Disable notifications?',
    `Removes the symlink ${plugin.link}. Re-enable with \`ws notifications enable\`.`,
    opts
  );
  if (existsSync(plugin.link)) unlinkSync(plugin.link);
  if (mode === 'json') {
    printJson({ ok: true, disabled: true, plugin: plugin.link });
    return;
  }
  printOk(`Notifications disabled (removed ${plugin.link})`);
}

export async function cmdNotificationsTest(
  kind: string,
  opts: GlobalOpts
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const resolved: NotificationKind = KINDS.includes(kind as NotificationKind)
    ? (kind as NotificationKind)
    : 'finished';
  const result = await platform.postNotification({
    title: 'ws test',
    message: `Test notification (${resolved})`,
    kind: resolved,
  });
  if (mode === 'json') {
    printJson({ ...result });
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    printOk(result.detail);
    return;
  }
  printFail(result.detail);
  process.exit(1);
}
