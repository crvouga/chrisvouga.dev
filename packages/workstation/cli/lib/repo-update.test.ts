import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  dirtyFiles,
  headSha,
  isGitRepo,
  pullFastForwardOnly,
} from './repo-update';

function git(dir: string, args: string[]): string {
  const proc = spawnSync(
    'git',
    ['-c', 'user.email=test@example.com', '-c', 'user.name=test', ...args],
    { cwd: dir, encoding: 'utf8' }
  );
  if (proc.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed:\n${proc.stderr ?? ''}${proc.stdout ?? ''}`
    );
  }
  return (proc.stdout ?? '').trim();
}

/** Origin repo with one commit + a clone of it. */
function originAndClone(): { origin: string; clone: string } {
  const base = mkdtempSync(join(tmpdir(), 'ws-update-'));
  const origin = join(base, 'origin');
  const clone = join(base, 'clone');
  const init = spawnSync('git', ['init', '-b', 'main', origin], {
    encoding: 'utf8',
  });
  if (init.status !== 0) throw new Error('git init -b main failed');
  git(origin, ['config', 'user.email', 'test@example.com']);
  git(origin, ['config', 'user.name', 'test']);
  writeFileSync(join(origin, 'file.txt'), 'v1\n');
  git(origin, ['add', 'file.txt']);
  git(origin, ['commit', '-m', 'v1']);
  const cloned = spawnSync('git', ['clone', origin, clone], {
    encoding: 'utf8',
  });
  if (cloned.status !== 0) throw new Error('git clone failed');
  return { origin, clone };
}

test('pullFastForwardOnly advances the clone when origin moves', () => {
  const { origin, clone } = originAndClone();
  const before = headSha(clone);

  writeFileSync(join(origin, 'file.txt'), 'v2\n');
  git(origin, ['add', 'file.txt']);
  git(origin, ['commit', '-m', 'v2']);

  const result = pullFastForwardOnly(clone);
  expect(result.updated).toBe(true);
  expect(result.before).toBe(before);
  expect(result.after).toBe(headSha(clone));
  expect(result.after).not.toBe(before);

  const again = pullFastForwardOnly(clone);
  expect(again.updated).toBe(false);
  expect(again.before).toBe(again.after);
});

test('dirtyFiles lists uncommitted changes', () => {
  const { clone } = originAndClone();
  expect(dirtyFiles(clone)).toEqual([]);
  writeFileSync(join(clone, 'file.txt'), 'local edit\n');
  const dirty = dirtyFiles(clone);
  expect(dirty.length).toBe(1);
  expect(dirty[0]).toContain('file.txt');
});

test('pullFastForwardOnly refuses a dirty tree', () => {
  const { clone } = originAndClone();
  writeFileSync(join(clone, 'file.txt'), 'local edit\n');
  expect(() => pullFastForwardOnly(clone)).toThrow(/uncommitted change/);
});

test('pullFastForwardOnly refuses a non-repo directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-update-plain-'));
  expect(isGitRepo(dir)).toBe(false);
  expect(() => pullFastForwardOnly(dir)).toThrow(/Not a git checkout/);
});
