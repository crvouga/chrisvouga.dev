import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureTuiPlugin, isTuiPluginRegistered } from './tui-config';
import { TmpPlatform } from './test-platform';

const PLUGIN_SUFFIX = join('opencode/tui', 'focus-session.ts');

function setupRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ws-repo-'));
  const target = join(root, PLUGIN_SUFFIX);
  mkdirSync(join(root, 'opencode/tui'), { recursive: true });
  writeFileSync(target, '// tui plugin');
  return root;
}

test('ensureTuiPlugin creates tui.json with $schema + plugin', async () => {
  const root = setupRoot();
  const platform = new TmpPlatform(mkdtempSync(join(tmpdir(), 'ws-home-')));
  const { path, status } = ensureTuiPlugin(platform, root);
  expect(status).toBe('created');
  expect(isTuiPluginRegistered(platform, root)).toBe(true);
  const parsed = JSON.parse(await Bun.file(path).text()) as {
    $schema?: string;
    plugin?: string[];
  };
  expect(parsed.$schema).toBe('https://opencode.ai/tui.json');
  expect(parsed.plugin).toEqual([join(root, PLUGIN_SUFFIX)]);
});

test('ensureTuiPlugin is idempotent and preserves user keys', async () => {
  const root = setupRoot();
  const platform = new TmpPlatform(mkdtempSync(join(tmpdir(), 'ws-home-')));
  mkdirSync(platform.opencodeDir(), { recursive: true });
  const path = join(platform.opencodeDir(), 'tui.json');
  writeFileSync(
    path,
    JSON.stringify({ theme: 'opencode', plugin: ['other-plugin'] }, null, 2)
  );
  const first = ensureTuiPlugin(platform, root);
  expect(first.status).toBe('updated');
  const parsed = JSON.parse(await Bun.file(path).text()) as {
    theme?: string;
    plugin?: string[];
  };
  expect(parsed.theme).toBe('opencode');
  expect(parsed.plugin).toContain('other-plugin');
  expect(parsed.plugin).toContain(join(root, PLUGIN_SUFFIX));
  expect(ensureTuiPlugin(platform, root).status).toBe('unchanged');
});

test('ensureTuiPlugin refuses malformed tui.json instead of clobbering', async () => {
  const root = setupRoot();
  const platform = new TmpPlatform(mkdtempSync(join(tmpdir(), 'ws-home-')));
  mkdirSync(platform.opencodeDir(), { recursive: true });
  const path = join(platform.opencodeDir(), 'tui.json');
  writeFileSync(path, 'not json{');
  expect(() => ensureTuiPlugin(platform, root)).toThrow(/malformed/);
  expect(await Bun.file(path).text()).toBe('not json{');
  expect(isTuiPluginRegistered(platform, root)).toBe(false);
});

test('ensureTuiPlugin replaces a non-array plugin value', () => {
  const root = setupRoot();
  const platform = new TmpPlatform(mkdtempSync(join(tmpdir(), 'ws-home-')));
  mkdirSync(platform.opencodeDir(), { recursive: true });
  const path = join(platform.opencodeDir(), 'tui.json');
  writeFileSync(path, JSON.stringify({ plugin: 'single' }));
  expect(ensureTuiPlugin(platform, root).status).toBe('updated');
  expect(isTuiPluginRegistered(platform, root)).toBe(true);
});
