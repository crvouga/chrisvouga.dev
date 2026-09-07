import { expect, test } from 'bun:test';

import { SecretStoreEntry } from './secret-store-entry';

test('defaults: seed/transform/validate are identity/no-op and docs are empty', () => {
  const entry = new SecretStoreEntry({
    key: 'OPENAI_API_KEY',
    required: false,
    usedBy: ['opencode'],
    hint: 'OpenAI API key',
  });

  expect(entry.key).toBe('OPENAI_API_KEY');
  expect(entry.required).toBe(false);
  expect(entry.seed()).toBeUndefined();
  expect(entry.transform(' value ')).toBe(' value ');
  expect(entry.validate('anything')).toBeNull();
  expect(entry.description).toBeUndefined();
  expect(entry.docsUrl).toBeUndefined();
  expect(entry.obtainUrl).toBeUndefined();
  expect(entry.vaultUiPath).toBeUndefined();
  expect(entry.validExample).toBeUndefined();
  expect(entry.invalidHint).toBeUndefined();
});

test('transform is applied and validate appends invalidHint on failure only', () => {
  const entry = new SecretStoreEntry({
    key: 'B2_S3_REGION',
    required: true,
    usedBy: ['server'],
    hint: 'B2 region',
    transform: (v) => v.trim(),
    validate: (v) => (v.length === 0 ? 'must not be blank' : null),
    invalidHint: 'Set B2_S3_REGION in Vault prd.',
  });

  expect(entry.transform('  us-west-004  ')).toBe('us-west-004');
  expect(entry.validate('us-west-004')).toBeNull();
  expect(entry.validate('')).toBe(
    'must not be blank\nSet B2_S3_REGION in Vault prd.'
  );
});

test('describe renders docs and links without secret values', () => {
  const entry = new SecretStoreEntry({
    key: 'ANTHROPIC_API_KEY',
    required: false,
    usedBy: ['opencode'],
    hint: 'Anthropic Claude API key',
    description: 'Unlocks Claude models in OpenCode.',
    docsUrl: 'https://docs.anthropic.com',
    obtainUrl: 'https://console.anthropic.com/settings/keys',
    vaultUiPath:
      'https://vault.chrisvouga.dev/ui/vault/secrets/secret/show/personal/prd',
    validExample: 'sk-ant-api03-…',
    invalidHint: 'Rotate the key in the Anthropic console.',
  });

  const out = entry.describe();
  expect(out).toContain('ANTHROPIC_API_KEY');
  expect(out).toContain('https://console.anthropic.com/settings/keys');
  expect(out).toContain('https://vault.chrisvouga.dev');
  expect(out).toContain('sk-ant-api03-…');
  expect(out).toContain('Rotate the key in the Anthropic console.');
  expect(out).not.toContain('secretvalue');
});
