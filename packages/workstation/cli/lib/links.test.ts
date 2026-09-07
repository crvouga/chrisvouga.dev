import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  conflictMessage,
  describeLink,
  ensureLink,
  managedLinks,
} from './links';
import { TmpPlatform } from './test-platform';

function setupRepo(): { root: string; target: string } {
  const root = mkdtempSync(join(tmpdir(), 'ws-repo-'));
  const target = join(root, 'opencode/plugins/notifications.ts');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, '// plugin');
  for (const file of [
    'opencode/bin/opencode-notifier',
    'opencode/bin/focus-opencode',
  ]) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '#!/bin/sh');
  }
  return { root, target };
}

test('managedLinks points every link into the repo and home dir', () => {
  const platform = new TmpPlatform(mkdtempSync(join(tmpdir(), 'ws-home-')));
  const links = managedLinks('/repo/packages/workstation', platform);
  expect(links.length).toBe(3);
  for (const link of links) {
    expect(link.target.startsWith('/repo/packages/workstation')).toBe(true);
    expect(link.link.startsWith(platform.opencodeDir())).toBe(true);
  }
});

test('ensureLink is idempotent; conflicts throw without overwriting', () => {
  const { root } = setupRepo();
  const platform = new TmpPlatform(mkdtempSync(join(tmpdir(), 'ws-home-')));
  const links = managedLinks(root, platform);
  for (const link of links) {
    expect(ensureLink(link)).toBe('created');
    expect(ensureLink(link)).toBe('unchanged');
    expect(describeLink(link).state).toBe('ok');
  }

  // A foreign file at a managed path is a conflict, never overwritten.
  const victim = links[0];
  if (victim === undefined) throw new Error('expected a managed link');
  unlinkSync(victim.link);
  writeFileSync(victim.link, 'not-managed');
  const status = describeLink(victim);
  expect(status.state).toBe('conflict-not-symlink');
  expect(() => ensureLink(victim)).toThrow();
  expect(conflictMessage(status)).toContain('ws sync');
});
