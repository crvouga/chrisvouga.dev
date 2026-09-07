/**
 * OpenRouter Auto Router configuration — the single owner of the `auto` model
 * that OpenCode uses for every task.
 *
 * The Auto Router (`openrouter/auto`) classifies each prompt into one of ~30
 * task types and routes to the model the OpenRouter community actually spends
 * on for that task, honoring a cost band plus optional model allow/deny lists.
 * See https://openrouter.ai/docs/guides/routing/routers/auto-router.
 *
 * Everything here is declarative and versioned so no OpenRouter account
 * setting (web UI "Routing" page) is ever needed — the cost tier and any
 * allowed/excluded models are sent per-request via the `auto-router` plugin.
 */

/** The OpenRouter model slug for the Auto Router. */
export const AUTO_ROUTER_MODEL_ID = 'openrouter/auto' as const;

/**
 * The OpenCode model reference for the Auto Router. OpenCode model
 * references are `provider/model-id`, and the OpenRouter provider is
 * `openrouter` while the Auto Router slug itself is `openrouter/auto`, so the
 * reference nests the provider prefix twice.
 */
export const AUTO_ROUTER_MODEL_REFERENCE =
  'openrouter/openrouter/auto' as const;

/** The per-request plugin id that carries Auto Router settings. */
export const AUTO_ROUTER_PLUGIN_ID = 'auto-router' as const;

/**
 * The cost band the router routes within. From cheapest to most capable:
 * `low`, `medium`, `high`, `xhigh`, `max`. A tier is a band, not a ceiling —
 * models cheaper than the band are excluded as well as models above it.
 */
export type AutoRouterCostTier = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Default cost band. `high` favors capable models (right for a coding agent
 * that must handle real tasks) without going to the `xhigh`/`max` extremes.
 * Override per-model via {@link autoRouterModel} options.
 */
export const DEFAULT_AUTO_ROUTER_COST_TIER: AutoRouterCostTier = 'high';

/** Wildcard-aware model filters (e.g. `anthropic/*`, `openai/gpt-5*`). */
export type AutoRouterModelPattern = string;

export type AutoRouterOptions = {
  costTier?: AutoRouterCostTier;
  allowedModels?: readonly AutoRouterModelPattern[];
  excludedModels?: readonly AutoRouterModelPattern[];
};

/** The `auto-router` plugin payload sent in the request body. */
export type AutoRouterPlugin = {
  id: string;
  cost_tier?: AutoRouterCostTier;
  allowed_models?: readonly AutoRouterModelPattern[];
  excluded_models?: readonly AutoRouterModelPattern[];
};

/** The request-body fragment OpenCode merges into each Auto Router call. */
export type AutoRouterRequest = {
  plugins: AutoRouterPlugin[];
};

/** The OpenCode model entry for the Auto Router (provider `models.<id>`). */
export type OpenCodeModelConfig = {
  id: string;
  name: string;
  description: string;
  family: string;
  tool_call: boolean;
  temperature: boolean;
  limit: { context: number; output: number };
  request: { body: AutoRouterRequest };
};

/** Build the `auto-router` plugin payload for a request. */
export function autoRouterPlugin(
  options: AutoRouterOptions = {}
): AutoRouterPlugin {
  const plugin: AutoRouterPlugin = { id: AUTO_ROUTER_PLUGIN_ID };
  const costTier = options.costTier ?? DEFAULT_AUTO_ROUTER_COST_TIER;
  plugin.cost_tier = costTier;
  if (options.allowedModels !== undefined && options.allowedModels.length > 0) {
    plugin.allowed_models = options.allowedModels;
  }
  if (
    options.excludedModels !== undefined &&
    options.excludedModels.length > 0
  ) {
    plugin.excluded_models = options.excludedModels;
  }
  return plugin;
}

/** Build the request-body fragment OpenCode injects into every Auto Router call. */
export function autoRouterRequest(
  options: AutoRouterOptions = {}
): AutoRouterRequest {
  return { plugins: [autoRouterPlugin(options)] };
}

/**
 * The OpenCode provider model entry for `openrouter/auto`. Registering the
 * model with a `request.body` that carries the `auto-router` plugin means the
 * routing preference is sent per-request (no OpenRouter web UI setting).
 */
export function autoRouterModel(
  options: AutoRouterOptions = {}
): OpenCodeModelConfig {
  return {
    id: AUTO_ROUTER_MODEL_ID,
    name: 'OpenRouter Auto (routing)',
    description: 'Auto Router — selects the best model for each task',
    family: 'auto',
    tool_call: true,
    temperature: true,
    limit: { context: 128000, output: 16000 },
    request: { body: autoRouterRequest(options) },
  };
}
