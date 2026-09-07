import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ensureAutoRouterDefaults,
  ensureSchema,
  getModel,
  getSmallModel,
  listProviders,
  loadConfig,
  removeProvider,
  setModel,
  writeConfig,
} from './opencode-config';
import { TmpPlatform } from './test-platform';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'ws-config-'));
}

test('setModel sets and clears model + small_model', () => {
  const withModel = setModel({}, 'm', 's');
  expect(getModel(withModel)).toBe('m');
  expect(getSmallModel(withModel)).toBe('s');
  const cleared = setModel(withModel, null, null);
  expect(getModel(cleared)).toBeNull();
  expect(getSmallModel(cleared)).toBeNull();
});

test('removeProvider deletes one provider and preserves the rest', () => {
  const cfg = { provider: { a: { options: {} }, b: { options: {} } } };
  const { updated, removed } = removeProvider(cfg, 'a');
  expect(removed).toBe(true);
  expect(listProviders(updated)).toEqual(['b']);
  expect(removeProvider(updated, 'missing').removed).toBe(false);
});

test('ensureSchema adds the schema only when absent', () => {
  expect(ensureSchema({})['$schema']).toBe('https://opencode.ai/config.json');
  expect(ensureSchema({ $schema: 'x' })['$schema']).toBe('x');
});

test('ensureAutoRouterDefaults only applies with openrouter connected', () => {
  const without = ensureAutoRouterDefaults({ provider: {} });
  expect(getModel(without)).toBeNull();
  const withRouter = ensureAutoRouterDefaults({
    provider: { openrouter: { options: {} } },
  });
  expect(getModel(withRouter)).toBe('openrouter/openrouter/auto');
  // An explicit choice is preserved.
  const explicit = ensureAutoRouterDefaults({
    provider: { openrouter: { options: {} } },
    model: 'other/model',
  });
  expect(getModel(explicit)).toBe('other/model');
});

test('writeConfig round-trips and refuses non-JSON', () => {
  const platform = new TmpPlatform(tmp());
  const path = writeConfig(platform, { provider: { a: {} } });
  expect(path.endsWith('opencode.json')).toBe(true);
  expect(listProviders(loadConfig(platform))).toEqual(['a']);

  writeFileSync(path, 'not json{{{');
  expect(() => loadConfig(platform)).toThrow();
});
