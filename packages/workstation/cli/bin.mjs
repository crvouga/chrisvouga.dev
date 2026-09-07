#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'cli', 'index.ts');
const args = process.argv.slice(2);

// Prefer bun (fast startup for this TS CLI); fall back to tsx when bun is absent.
const bun = spawnSync('bun', ['--version'], { stdio: 'ignore' });
let result;
if (bun.status === 0) {
  result = spawnSync('bun', [entry, ...args], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
} else {
  const tsx = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  result = spawnSync(process.execPath, [tsx, entry, ...args], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
}

process.exit(result.status ?? 1);
