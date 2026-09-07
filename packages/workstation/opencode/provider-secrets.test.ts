import { expect, test } from 'bun:test';

import { OPENCODE_PROVIDER_CATALOG } from './provider-secrets';

const pad = (n: number): string => 'x'.repeat(n);

/**
 * Representative (synthetic, low-entropy) API key shapes that satisfy each
 * provider's validator. These are placeholders — never real credentials.
 */
const VALID_SAMPLES: Record<string, string> = {
  ANTHROPIC_API_KEY: `sk-ant-${pad(24)}`,
  OPENAI_API_KEY: `sk-${pad(24)}`,
  GEMINI_API_KEY: `AIza-${pad(24)}`,
  GROQ_API_KEY: `gsk_${pad(24)}`,
  DEEPSEEK_API_KEY: `sk-${pad(24)}`,
  MISTRAL_API_KEY: pad(32),
  TOGETHER_API_KEY: pad(32),
  FIREWORKS_API_KEY: `fw_${pad(24)}`,
  PERPLEXITY_API_KEY: `pplx-${pad(24)}`,
  OPENROUTER_API_KEY: `sk-or-${pad(24)}`,
  XAI_API_KEY: `xai-${pad(24)}`,
  HUGGINGFACE_API_KEY: `hf_${pad(24)}`,
  CEREBRAS_API_KEY: `csk-${pad(24)}`,
  VENICE_API_KEY: pad(32),
  POOLSIDE_API_KEY: `sky_${pad(24)}`,
  NVIDIA_API_KEY: `nvapi-${pad(20)}`,
  MINIMAX_API_KEY: pad(32),
  GLM_API_KEY: pad(32),
  OLLAMA_API_KEY: pad(32),
  LITELLM_LM_STUDIO_API_KEY: pad(32),
};

test('every catalogued provider carries a SecretStoreEntry (optional, opencode)', () => {
  expect(OPENCODE_PROVIDER_CATALOG.length).toBeGreaterThan(0);
  for (const p of OPENCODE_PROVIDER_CATALOG) {
    expect(p.entry).toBeDefined();
    expect(p.entry.required).toBe(false);
    expect(p.entry.usedBy).toContain('opencode');
  }
});

test('every catalogued provider carries obtainable docs (description/obtain/docs/vault)', () => {
  for (const p of OPENCODE_PROVIDER_CATALOG) {
    expect(p.entry.description, p.vaultKey).toBeTruthy();
    expect(p.entry.obtainUrl, p.vaultKey).toBeTruthy();
    expect(p.entry.docsUrl, p.vaultKey).toBeTruthy();
    expect(p.entry.vaultUiPath, p.vaultKey).toBeTruthy();
    expect(p.entry.invalidHint, p.vaultKey).toBeTruthy();
  }
});

test('transform trims whitespace before validation', () => {
  for (const p of OPENCODE_PROVIDER_CATALOG) {
    const sample = VALID_SAMPLES[p.vaultKey];
    expect(p.entry.transform(`  ${sample}  `), p.vaultKey).toBe(sample);
  }
});

test('each provider accepts a representative key and rejects a malformed one', () => {
  for (const p of OPENCODE_PROVIDER_CATALOG) {
    const sample = VALID_SAMPLES[p.vaultKey];
    expect(p.entry.validate(sample), p.vaultKey).toBeNull();
    expect(p.entry.validate('x'), p.vaultKey).not.toBeNull();
    expect(p.entry.validate(''), p.vaultKey).not.toBeNull();
  }
});

test('prefix-based providers reject keys with the wrong prefix', () => {
  const wrongPrefixSamples: Record<string, string> = {
    ANTHROPIC_API_KEY: `sk-proj-${pad(24)}`,
    GROQ_API_KEY: `sk-${pad(24)}`,
    FIREWORKS_API_KEY: `pplx-${pad(24)}`,
    PERPLEXITY_API_KEY: `fw_${pad(24)}`,
    OPENROUTER_API_KEY: `sk-proj-${pad(24)}`,
    XAI_API_KEY: `sk-ant-${pad(24)}`,
    HUGGINGFACE_API_KEY: `sk-proj-${pad(24)}`,
    CEREBRAS_API_KEY: `sk-${pad(24)}`,
    POOLSIDE_API_KEY: `hf_${pad(24)}`,
    NVIDIA_API_KEY: `sk-${pad(24)}`,
    GEMINI_API_KEY: `sk-proj-${pad(24)}`,
  };
  for (const p of OPENCODE_PROVIDER_CATALOG) {
    const wrong = wrongPrefixSamples[p.vaultKey];
    if (wrong === undefined) continue;
    expect(p.entry.validate(wrong), p.vaultKey).not.toBeNull();
  }
});
