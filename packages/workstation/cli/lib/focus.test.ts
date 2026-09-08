import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildFocusArgs,
  focusTargetFor,
  resolveFocusScript,
  runFocusScript,
  tagTerminalTitle,
} from './focus';

/** Checked-in click handler under test. */
function repoFocusScript(): string {
  return join(import.meta.dir, '..', '..', 'opencode/bin/focus-opencode');
}

function canRunBash(): boolean {
  try {
    const result = spawnSync('bash', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

test('resolveFocusScript prefers the home handler, falls back to the repo', () => {
  const home = '/home/u/.config/opencode/bin/focus-opencode';
  const repo = '/repo/opencode/bin/focus-opencode';
  const present = new Set([home, repo]);
  expect(
    resolveFocusScript({
      homeScript: home,
      repoScript: repo,
      exists: (path) => present.has(path),
    })
  ).toBe(home);
  present.delete(home);
  expect(
    resolveFocusScript({
      homeScript: home,
      repoScript: repo,
      exists: (path) => present.has(path),
    })
  ).toBe(repo);
  present.delete(repo);
  expect(
    resolveFocusScript({
      homeScript: home,
      repoScript: repo,
      exists: (path) => present.has(path),
    })
  ).toBeUndefined();
});

test('buildFocusArgs passes the full click payload plus opt-in dry-run', () => {
  const base = {
    kind: 'permission',
    session: 'ses_abc',
    dir: '/repo/proj',
    title: 'Fix bug',
    token: 'AtQbt0N',
  };
  expect(buildFocusArgs(base)).toEqual([
    '--kind',
    'permission',
    '--session',
    'ses_abc',
    '--dir',
    '/repo/proj',
    '--title',
    'Fix bug',
    '--token',
    'AtQbt0N',
  ]);
  expect(buildFocusArgs({ ...base, dryRun: true })).toContain('--dry-run');
  expect(buildFocusArgs({ dir: '/repo/proj' })).toEqual([
    '--kind',
    'finished',
    '--session',
    '',
    '--dir',
    '/repo/proj',
    '--title',
    '',
    '--token',
    '',
  ]);
});

test('focusTargetFor mirrors the handler target (token > title > opencode)', () => {
  expect(
    focusTargetFor({ dir: '/x', token: 'AbC1234', title: 'Fix bug' })
  ).toBe('AbC1234');
  expect(focusTargetFor({ dir: '/x', title: 'Fix bug' })).toBe('Fix bug');
  expect(focusTargetFor({ dir: '/x' })).toBe('opencode');
});

test('tagTerminalTitle writes the tagged OSC 0 title', () => {
  const chunks: string[] = [];
  const result = tagTerminalTitle('ses_f8544b407ffeHmm0Sb9AtQbt0N', 'Fix bug', {
    open: () => 9,
    write: (_fd, data) => {
      chunks.push(data);
    },
    close: () => undefined,
  });
  expect(result.ok).toBe(true);
  expect(chunks).toEqual(['\x1b]0;opencode AtQbt0N · Fix bug\x07']);
});

test('tagTerminalTitle degrades without a session id or tty', () => {
  expect(tagTerminalTitle(undefined, 'Fix bug').ok).toBe(false);
  expect(tagTerminalTitle('', undefined).ok).toBe(false);
  const noTty = tagTerminalTitle('ses_f8544b407ffeHmm0Sb9AtQbt0N', undefined, {
    open: () => {
      throw new Error('no tty');
    },
    write: () => undefined,
    close: () => undefined,
  });
  expect(noTty.ok).toBe(false);
  expect(noTty.detail).toContain('/dev/tty');
});

test('focus-opencode --dry-run prints the Cmd+P + term plan (no side effects)', () => {
  if (!canRunBash()) return;
  const script = repoFocusScript();
  if (!existsSync(script)) throw new Error('focus-opencode missing');
  const result = runFocusScript(script, {
    kind: 'finished',
    session: 'ses_f8544b407ffeHmm0Sb9AtQbt0N',
    dir: '/repo/proj',
    title: 'Fix bug',
    token: 'AtQbt0N',
    dryRun: true,
  });
  expect(result.ok).toBe(true);
  // Workbench Quick Open (not Ctrl+Tab): works from TUI terminal focus.
  expect(result.stdout).toContain('Cmd+P');
  // Panel terminals only appear under the `term ` prefix — the old
  // plain-query-only handler could never match them (the reported bug).
  expect(result.stdout).toContain('term AtQbt0N');
  // Raise-only window targeting: never opens or reloads VS Code.
  expect(result.stdout).not.toContain('code -r');
  expect(result.stdout).toContain('never opens');
  expect(result.stdout).toContain('focus-request');
});
