import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { Platform } from './platform/types';

export type ManagedLink = {
  label: string;
  /** Checked-in source of truth (absolute). */
  target: string;
  /** Home-directory destination (absolute). */
  link: string;
};

export type LinkState = 'created' | 'unchanged';

export type LinkStatus =
  | { state: 'ok'; link: ManagedLink }
  | { state: 'missing'; link: ManagedLink }
  | { state: 'conflict-not-symlink'; link: ManagedLink }
  | { state: 'conflict-wrong-target'; link: ManagedLink; current: string };

/** All symlinks `ws sync` manages. Pure — unit-tested. */
export function managedLinks(
  workstationRoot: string,
  platform: Platform
): ManagedLink[] {
  const openDir = platform.opencodeDir();
  return [
    {
      label: 'OpenCode notification plugin',
      target: join(workstationRoot, 'opencode/plugins/notifications.ts'),
      link: join(openDir, 'plugins/notifications.ts'),
    },
    {
      label: 'OpenCode notifier CLI',
      target: join(workstationRoot, 'opencode/bin/opencode-notifier'),
      link: join(openDir, 'bin/opencode-notifier'),
    },
    {
      label: 'OpenCode focus script (notification click handler)',
      target: join(workstationRoot, 'opencode/bin/focus-opencode'),
      link: join(openDir, 'bin/focus-opencode'),
    },
  ];
}

export function describeLink(managed: ManagedLink): LinkStatus {
  let stat: ReturnType<typeof lstatSync> | undefined;
  try {
    stat = lstatSync(managed.link);
  } catch {
    return { state: 'missing', link: managed };
  }
  if (!stat.isSymbolicLink())
    return { state: 'conflict-not-symlink', link: managed };
  let current: string | undefined;
  try {
    current = readlinkSync(managed.link);
  } catch {
    current = '<unreadable>';
  }
  if (current === managed.target) return { state: 'ok', link: managed };
  return {
    state: 'conflict-wrong-target',
    link: managed,
    current: current ?? '<unreadable>',
  };
}

export function conflictMessage(status: LinkStatus): string {
  const link = status.link.link;
  if (status.state === 'conflict-not-symlink') {
    return (
      `Conflict: ${link} already exists and is not a symlink managed by this repository.\n` +
      `Move or remove it, then run \`ws sync\` again.`
    );
  }
  if (status.state === 'conflict-wrong-target') {
    return (
      `Conflict: ${link} is a symlink to ${status.current}, not to ${status.link.target}.\n` +
      `Remove it, then run \`ws sync\` again.`
    );
  }
  return `Conflict: ${link} is in an unexpected state.`;
}

/** Create the symlink when missing; throw an actionable error on conflict. */
export function ensureLink(managed: ManagedLink): LinkState {
  const status = describeLink(managed);
  if (status.state === 'ok') return 'unchanged';
  if (status.state === 'missing') {
    mkdirSync(dirname(managed.link), { recursive: true });
    symlinkSync(managed.target, managed.link);
    return 'created';
  }
  throw new Error(conflictMessage(status));
}

/** Remove a managed symlink when it points at our target (disable flow). */
export function removeManagedLink(managed: ManagedLink): boolean {
  const status = describeLink(managed);
  if (status.state !== 'ok') return false;
  unlinkSync(managed.link);
  return true;
}
