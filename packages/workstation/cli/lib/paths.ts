import { join } from 'node:path';

/**
 * Absolute repo checkout root of `packages/workstation/` (works from any CWD).
 *
 * This file lives at `packages/workstation/cli/lib/paths.ts`, so the root is
 * two levels up. Uses `import.meta.dir` (Bun + tsx) instead of URL parsing.
 */
export function workstationRoot(): string {
  return join(import.meta.dir, '..', '..');
}

/**
 * Absolute root of the `workspace` monorepo checkout that contains
 * `packages/workstation/` (works from any CWD).
 */
export function workspaceRoot(): string {
  return join(workstationRoot(), '..', '..');
}

/** Version string for `--version` (package.json, best-effort). */
export async function workstationVersion(): Promise<string> {
  try {
    const pkg = (await import('../../package.json', {
      with: { type: 'json' },
    })) as { default: { version?: string } };
    return pkg.default.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
