import { SecretStoreEntry } from '@pkgs/secret-store';

/** Vault UI base link for `personal/<config>` (target config is appended). */
export const VAULT_UI_PATH_BASE =
  'https://vault.chrisvouga.dev/ui/vault/secrets/secret/show/personal/prd';

/**
 * A single OpenCode provider connection, driven by one Vault secret.
 *
 * `entry` is the declarative {@link SecretStoreEntry} that holds the API key
 * name plus the documentation used to obtain it and to debug an invalid value.
 * The remaining fields describe how to surface the provider in OpenCode's
 * config: built-in providers need only `options.apiKey`; openai-compatible /
 * local providers also need `npm`, `baseURL`, and optionally `models`.
 */
export type OpenCodeProviderConfig = {
  /** OpenCode provider id (e.g. `anthropic`, `google`, `openrouter`). */
  readonly provider: string;
  /** Human display name used in the config. */
  readonly name: string;
  /** Vault key field for the API key (single source of truth). */
  readonly vaultKey: string;
  /** The declarative secret entry — validate + docs live here. */
  readonly entry: SecretStoreEntry;
  /** Provider SDK npm package (required for openai-compatible / local). */
  readonly npm?: string;
  /** Custom base URL (for openai-compatible / local / gateways). */
  readonly baseURL?: string;
  /** Models registered for custom / local providers. */
  readonly models?: Readonly<Record<string, unknown>>;
};

function vaultUiPath(key: string): string {
  return `${VAULT_UI_PATH_BASE}/${key}`;
}

/**
 * Central catalog of every OpenCode provider connection sourced from the
 * secret store. Each entry is `required: false` — the configure step only
 * wires a provider when its Vault key exists and validates. Missing keys are
 * reported with the per-entry documentation so they can be added later.
 */
export const OPENCODE_PROVIDER_CATALOG: readonly OpenCodeProviderConfig[] = [
  opencodeEntry({
    provider: 'anthropic',
    name: 'Anthropic',
    vaultKey: 'ANTHROPIC_API_KEY',
    description: 'Claude models (Haiku/Sonnet/Opus) via Anthropic.',
    obtainUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com',
    validExample: 'sk-ant-api03-…',
  }),
  opencodeEntry({
    provider: 'openai',
    name: 'OpenAI',
    vaultKey: 'OPENAI_API_KEY',
    description: 'GPT / o-series models via OpenAI.',
    obtainUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
    validExample: 'sk-…',
  }),
  opencodeEntry({
    provider: 'google',
    name: 'Google Gemini',
    vaultKey: 'GEMINI_API_KEY',
    description: 'Gemini models via Google AI Studio.',
    obtainUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    validExample: 'AIza…',
  }),
  opencodeEntry({
    provider: 'groq',
    name: 'Groq',
    vaultKey: 'GROQ_API_KEY',
    description: 'Fast inference (Llama, Mixtral) via Groq.',
    obtainUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs',
    validExample: 'gsk_…',
  }),
  opencodeEntry({
    provider: 'deepseek',
    name: 'DeepSeek',
    vaultKey: 'DEEPSEEK_API_KEY',
    description: 'DeepSeek models via DeepSeek API.',
    obtainUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com',
    validExample: 'sk-…',
  }),
  opencodeEntry({
    provider: 'mistral',
    name: 'Mistral',
    vaultKey: 'MISTRAL_API_KEY',
    description: 'Mistral models via Mistral AI.',
    obtainUrl: 'https://console.mistral.ai/api-keys',
    docsUrl: 'https://docs.mistral.ai',
    validExample: '…',
  }),
  opencodeEntry({
    provider: 'together',
    name: 'Together AI',
    vaultKey: 'TOGETHER_API_KEY',
    description: 'Open-weights models via Together AI.',
    obtainUrl: 'https://api.together.xyz/settings/api-keys',
    docsUrl: 'https://docs.together.ai',
    validExample: '…',
  }),
  opencodeEntry({
    provider: 'fireworks',
    name: 'Fireworks AI',
    vaultKey: 'FIREWORKS_API_KEY',
    description: 'Open models via Fireworks AI.',
    obtainUrl: 'https://app.fireworks.ai/settings/api-keys',
    docsUrl: 'https://docs.fireworks.ai',
    validExample: '…',
  }),
  opencodeEntry({
    provider: 'perplexity',
    name: 'Perplexity',
    vaultKey: 'PERPLEXITY_API_KEY',
    description: 'Search-grounded models via Perplexity.',
    obtainUrl: 'https://www.perplexity.ai/settings/api',
    docsUrl: 'https://docs.perplexity.ai',
    validExample: '…',
  }),
  opencodeEntry({
    provider: 'openrouter',
    name: 'OpenRouter',
    vaultKey: 'OPENROUTER_API_KEY',
    description: 'Many models via a single OpenRouter key.',
    obtainUrl: 'https://openrouter.ai/settings/keys',
    docsUrl: 'https://openrouter.ai/docs',
    validExample: 'sk-or-…',
  }),
  opencodeEntry({
    provider: 'xai',
    name: 'xAI',
    vaultKey: 'XAI_API_KEY',
    description: 'Grok models via xAI.',
    obtainUrl: 'https://console.x.ai',
    docsUrl: 'https://docs.x.ai',
    validExample: 'xai-…',
  }),
  opencodeEntry({
    provider: 'huggingface',
    name: 'Hugging Face',
    vaultKey: 'HUGGINGFACE_API_KEY',
    description: 'Inference Providers models via Hugging Face.',
    obtainUrl: 'https://huggingface.co/settings/tokens',
    docsUrl: 'https://huggingface.co/docs/inference-providers',
    validExample: 'hf_…',
  }),
  opencodeEntry({
    provider: 'cerebras',
    name: 'Cerebras',
    vaultKey: 'CEREBRAS_API_KEY',
    description: 'Cerebras inference models.',
    obtainUrl: 'https://cloud.cerebras.ai',
    docsUrl: 'https://inference-docs.cerebras.ai',
    validExample: '…',
  }),
  opencodeEntry({
    provider: 'venice',
    name: 'Venice AI',
    vaultKey: 'VENICE_API_KEY',
    description: 'Venice AI models.',
    obtainUrl: 'https://venice.ai',
    docsUrl: 'https://docs.venice.ai',
    validExample: '…',
  }),
  opencodeEntry({
    provider: 'poolside',
    name: 'Poolside',
    vaultKey: 'POOLSIDE_API_KEY',
    description: 'Poolside models.',
    obtainUrl: 'https://app.poolside.ai',
    docsUrl: 'https://docs.poolside.ai',
    validExample: '…',
  }),
  opencodeEntry({
    provider: 'nvidia',
    name: 'NVIDIA',
    vaultKey: 'NVIDIA_API_KEY',
    description: 'NVIDIA NIM / build.nvidia.com models.',
    obtainUrl: 'https://build.nvidia.com',
    docsUrl: 'https://docs.nvidia.com/nim',
    validExample: 'nvapi-…',
  }),
  opencodeEntry({
    provider: 'minimax',
    name: 'MiniMax',
    vaultKey: 'MINIMAX_API_KEY',
    description: 'MiniMax models.',
    obtainUrl: 'https://platform.minimax.io',
    docsUrl: 'https://platform.minimax.io/docs',
    validExample: '…',
  }),
  opencodeEntry({
    provider: 'zai',
    name: 'Z.AI (GLM)',
    vaultKey: 'GLM_API_KEY',
    description: 'GLM models via Z.AI.',
    obtainUrl: 'https://open.bigmodel.cn',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
    validExample: '…',
  }),
  localEntry({
    provider: 'ollama',
    name: 'Ollama (local)',
    vaultKey: 'OLLAMA_API_KEY',
    description: 'Local models served by Ollama (OpenAI-compatible).',
    obtainUrl: 'https://ollama.com/settings/keys',
    docsUrl: 'https://docs.ollama.com',
    baseURL: 'http://127.0.0.1:11434/v1',
  }),
  localEntry({
    provider: 'lmstudio',
    name: 'LM Studio (local)',
    vaultKey: 'LITELLM_LM_STUDIO_API_KEY',
    description: 'Local models served by LM Studio (OpenAI-compatible).',
    obtainUrl: 'https://lmstudio.ai',
    docsUrl: 'https://lmstudio.ai/docs',
    baseURL: 'http://127.0.0.1:1234/v1',
  }),
];

type EntryBase = {
  provider: string;
  name: string;
  vaultKey: string;
  description?: string;
  obtainUrl?: string;
  docsUrl?: string;
  validExample?: string;
  invalidHint?: string;
};

function opencodeEntry(base: EntryBase): OpenCodeProviderConfig {
  return baseEntry(base);
}

function localEntry(
  base: EntryBase & { baseURL: string }
): OpenCodeProviderConfig {
  return {
    ...baseEntry(base),
    npm: '@ai-sdk/openai-compatible',
    baseURL: base.baseURL,
    models: {},
  };
}

function baseEntry(base: EntryBase): OpenCodeProviderConfig {
  const entry = new SecretStoreEntry({
    key: base.vaultKey,
    required: false,
    usedBy: ['opencode'],
    hint: `API key for the "${base.name}" OpenCode provider`,
    description: base.description,
    obtainUrl: base.obtainUrl,
    docsUrl: base.docsUrl,
    vaultUiPath: vaultUiPath(base.vaultKey),
    validExample: base.validExample,
    invalidHint:
      base.invalidHint ??
      `Rotate ${base.vaultKey} at ${base.obtainUrl ?? 'the provider console'} and re-run \`bun run workstation:configure:opencode\`.`,
  });
  return {
    provider: base.provider,
    name: base.name,
    vaultKey: base.vaultKey,
    entry,
  };
}

/** The `SecretStoreEntry` for every catalogued provider (for validation). */
export function opencodeProviderEntries(): readonly SecretStoreEntry[] {
  return OPENCODE_PROVIDER_CATALOG.map((p) => p.entry);
}
