import { spawnSync } from 'node:child_process';

export type PullResult = {
  before: string;
  after: string;
  updated: boolean;
};

function runGit(dir: string, args: string[]): string {
  const proc = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (proc.status !== 0) {
    const detail = `${proc.stderr ?? ''}${proc.stdout ?? ''}`.trim();
    throw new Error(
      `git ${args.join(' ')} failed${detail.length > 0 ? `:\n${detail}` : ''}`
    );
  }
  return (proc.stdout ?? '').trim();
}

export function isGitRepo(dir: string): boolean {
  try {
    return (
      spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], {
        stdio: 'ignore',
      }).status === 0
    );
  } catch {
    return false;
  }
}

export function headSha(dir: string): string {
  return runGit(dir, ['rev-parse', '--short', 'HEAD']);
}

/** Porcelain lines for uncommitted changes (empty when the tree is clean). */
export function dirtyFiles(dir: string): string[] {
  return runGit(dir, ['status', '--porcelain'])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Fast-forward the checkout in `dir` to its upstream (GitHub origin).
 * Throws when `dir` is not a git checkout, when the tree is dirty, or when
 * the pull is not a fast-forward (local branch diverged).
 */
export function pullFastForwardOnly(dir: string): PullResult {
  if (!isGitRepo(dir)) {
    throw new Error(
      `Not a git checkout: ${dir}\nClone the workspace repo, then run \`bun run ws:install\`.`
    );
  }
  const dirty = dirtyFiles(dir);
  if (dirty.length > 0) {
    const preview = dirty.slice(0, 10).join('\n');
    const more = dirty.length > 10 ? `\n… and ${dirty.length - 10} more` : '';
    throw new Error(
      `Refusing to update with ${dirty.length} uncommitted change(s):\n${preview}${more}\nCommit or stash them, then run \`ws update\` again.`
    );
  }
  const before = headSha(dir);
  try {
    runGit(dir, ['pull', '--ff-only']);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${msg}\nLocal branch diverged — reconcile it manually (e.g. \`git pull --rebase\`), then run \`ws update\` again.`
    );
  }
  const after = headSha(dir);
  return { before, after, updated: before !== after };
}
