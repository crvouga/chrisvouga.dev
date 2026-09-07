import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  curatedFallbackModels,
  filterModels,
  resolveModelCatalog,
  resolveModelRef,
  type ModelEntry,
} from './models';
import { TmpPlatform } from './test-platform';

const SAMPLE: ModelEntry[] = [
  { id: 'anthropic/claude-opus-4-1', name: 'Claude Opus 4.1' },
  { id: 'openai/gpt-5', name: 'GPT-5' },
  { id: 'openrouter/auto', name: 'OpenRouter Auto (routing)' },
];

test('resolveModelRef prefers the directly connected provider', () => {
  expect(resolveModelRef('anthropic/claude-opus-4-1', ['anthropic'])).toBe(
    'anthropic/claude-opus-4-1'
  );
  expect(resolveModelRef('anthropic/claude-opus-4-1', ['openrouter'])).toBe(
    'openrouter/anthropic/claude-opus-4-1'
  );
  expect(resolveModelRef('openrouter/auto', ['openrouter'])).toBe(
    'openrouter/openrouter/auto'
  );
  expect(resolveModelRef('openrouter/auto', [])).toBe(
    'openrouter/openrouter/auto'
  );
  expect(resolveModelRef('bare-id', ['anthropic'])).toBe('bare-id');
});

test('filterModels matches all tokens across name and id', () => {
  expect(filterModels(SAMPLE, '')).toHaveLength(3);
  expect(filterModels(SAMPLE, 'claude')).toHaveLength(1);
  expect(filterModels(SAMPLE, 'CLAUDE opus')).toHaveLength(1);
  expect(filterModels(SAMPLE, 'gpt openai')).toHaveLength(1);
  expect(filterModels(SAMPLE, 'no-such-model')).toHaveLength(0);
});

test('curated fallback always offers the Auto Router first', () => {
  const fallback = curatedFallbackModels();
  expect(fallback.length).toBeGreaterThan(0);
  expect(fallback[0]?.id).toBe('openrouter/auto');
});

test('resolveModelCatalog serves a fresh cache without network', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ws-models-'));
  const platform = new TmpPlatform(tmp);
  const dir = join(tmp, '.cache');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'ws-models.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), models: SAMPLE })
  );
  const catalog = await resolveModelCatalog(platform);
  expect(catalog.source).toBe('cache');
  expect(catalog.models).toEqual(SAMPLE);
});
