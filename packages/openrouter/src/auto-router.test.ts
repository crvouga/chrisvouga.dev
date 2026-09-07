import { expect, test } from 'bun:test';

import {
  AUTO_ROUTER_MODEL_ID,
  AUTO_ROUTER_MODEL_REFERENCE,
  AUTO_ROUTER_PLUGIN_ID,
  DEFAULT_AUTO_ROUTER_COST_TIER,
  autoRouterModel,
  autoRouterPlugin,
  autoRouterRequest,
} from './auto-router';

test('auto router slug and reference are consistent with the openrouter provider', () => {
  expect(AUTO_ROUTER_MODEL_ID).toBe('openrouter/auto');
  expect(AUTO_ROUTER_MODEL_REFERENCE).toBe('openrouter/openrouter/auto');
});

test('plugin defaults to the configured cost tier and the auto-router id', () => {
  const plugin = autoRouterPlugin();
  expect(plugin.id).toBe(AUTO_ROUTER_PLUGIN_ID);
  expect(plugin.cost_tier).toBe(DEFAULT_AUTO_ROUTER_COST_TIER);
  expect(plugin.allowed_models).toBeUndefined();
  expect(plugin.excluded_models).toBeUndefined();
});

test('plugin honors explicit cost tier and model filters', () => {
  const plugin = autoRouterPlugin({
    costTier: 'medium',
    allowedModels: ['anthropic/*', 'openai/gpt-5.1'],
    excludedModels: ['openai/gpt-4o'],
  });
  expect(plugin.cost_tier).toBe('medium');
  expect(plugin.allowed_models).toEqual(['anthropic/*', 'openai/gpt-5.1']);
  expect(plugin.excluded_models).toEqual(['openai/gpt-4o']);
});

test('empty model filters are omitted from the plugin payload', () => {
  const plugin = autoRouterPlugin({ allowedModels: [], excludedModels: [] });
  expect(plugin.allowed_models).toBeUndefined();
  expect(plugin.excluded_models).toBeUndefined();
});

test('request body wraps a single auto-router plugin', () => {
  const request = autoRouterRequest({ costTier: 'xhigh' });
  expect(request.plugins).toHaveLength(1);
  expect(request.plugins[0]?.id).toBe(AUTO_ROUTER_PLUGIN_ID);
  expect(request.plugins[0]?.cost_tier).toBe('xhigh');
});

test('model entry is selectable and carries the auto-router request body', () => {
  const model = autoRouterModel();
  expect(model.id).toBe(AUTO_ROUTER_MODEL_ID);
  expect(model.family).toBe('auto');
  expect(model.tool_call).toBe(true);
  expect(model.temperature).toBe(true);
  expect(model.limit.context).toBeGreaterThan(0);
  expect(model.limit.output).toBeGreaterThan(0);
  expect(model.request.body.plugins[0]?.id).toBe(AUTO_ROUTER_PLUGIN_ID);
  expect(model.request.body.plugins[0]?.cost_tier).toBe(
    DEFAULT_AUTO_ROUTER_COST_TIER
  );
});
