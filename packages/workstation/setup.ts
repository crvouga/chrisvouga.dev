#!/usr/bin/env bun
/**
 * Deprecated: use `bun run ws:install` (repo root) or the `ws` CLI.
 *
 * This shim preserves the old entry point by forwarding to the new global
 * installer (`cli/install-global.ts`), which installs/overwrites the `ws`
 * launcher and converges the workstation.
 *
 * Usage:
 *   bun run ws:install
 *   ws sync
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const installer = join(import.meta.dir, 'cli/install-global.ts');
const result = spawnSync('bun', [installer, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
