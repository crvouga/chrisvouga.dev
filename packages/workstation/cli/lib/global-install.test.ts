import { expect, test } from 'bun:test';

import {
  isOnPath,
  launcherCmdScript,
  launcherShellScript,
  pathExportLine,
} from './global-install';

test('isOnPath matches exact PATH entries', () => {
  expect(isOnPath('/a/.local/bin', '/a/.local/bin:/usr/bin')).toBe(true);
  expect(isOnPath('/a/.local/bin', '/usr/bin:/bin')).toBe(false);
  expect(isOnPath('/a/.local/bin', '')).toBe(false);
});

test('pathExportLine uses fish syntax for fish RCs', () => {
  expect(pathExportLine('/h/.local/bin', '/h/.config/fish/config.fish')).toBe(
    'fish_add_path "/h/.local/bin"'
  );
  expect(pathExportLine('/h/.local/bin', '/h/.zshrc')).toBe(
    'export PATH="/h/.local/bin:$PATH"'
  );
});

test('launchers exec the checked-in CLI entry', () => {
  const sh = launcherShellScript('/repo/packages/workstation');
  expect(sh.startsWith('#!/bin/sh')).toBe(true);
  expect(sh).toContain('/repo/packages/workstation/cli/index.ts');
  const cmd = launcherCmdScript('/repo/packages/workstation');
  expect(cmd).toContain('/repo/packages/workstation/cli/index.ts');
});
