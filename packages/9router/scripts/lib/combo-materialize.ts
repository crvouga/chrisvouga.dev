import type {
  CombosSpec,
  CombosTemplateSpec,
  SpecCombo,
  TemplateCombo,
} from "./combos.ts";
import {
  llmModelsFor,
  providersInRole,
  rankModels,
  type ProviderIndex,
} from "./registry.ts";

export const CONNECTED_COMBO_NAME = "9router-connected";

export type SkippedTier = {
  combo: string;
  reason: string;
};

export type MaterializeResult = {
  /** Concrete combos (+ optional 9router-connected). */
  spec: CombosSpec;
  skippedTiers: SkippedTier[];
  droppedCombos: string[];
};

function emitModel(
  providerId: string,
  modelId: string,
  index: ProviderIndex,
): string {
  const alias = index.aliasByProvider.get(providerId) ?? providerId;
  return `${alias}/${modelId}`;
}

/**
 * Pick up to `pick` LLM models across connected providers (round-robin by
 * ranked model within each provider, then next provider).
 */
function pickFromProviders(
  providerIds: string[],
  active: Set<string>,
  index: ProviderIndex,
  pick: number,
  perProviderCap: number,
): { models: string[]; skippedConnected: string[]; skippedInactive: string[] } {
  const connected = providerIds.filter((id) => active.has(id));
  const skippedInactive = providerIds.filter((id) => !active.has(id));
  if (connected.length === 0) {
    return { models: [], skippedConnected: [], skippedInactive };
  }

  const rankedByProvider = new Map<string, string[]>();
  const skippedConnected: string[] = [];
  for (const id of connected) {
    const ranked = rankModels(llmModelsFor(id, index)).slice(0, perProviderCap);
    if (ranked.length === 0) {
      skippedConnected.push(id);
      continue;
    }
    rankedByProvider.set(id, ranked);
  }

  const usable = connected.filter((id) => rankedByProvider.has(id));
  const models: string[] = [];
  const seen = new Set<string>();
  let round = 0;
  while (models.length < pick) {
    let added = false;
    for (const id of usable) {
      if (models.length >= pick) break;
      const list = rankedByProvider.get(id) ?? [];
      const modelId = list[round];
      if (!modelId) continue;
      const emitted = emitModel(id, modelId, index);
      if (seen.has(emitted)) continue;
      seen.add(emitted);
      models.push(emitted);
      added = true;
    }
    if (!added) break;
    round += 1;
  }

  return { models, skippedConnected, skippedInactive };
}

function resolveCombo(
  combo: TemplateCombo,
  template: CombosTemplateSpec,
  active: Set<string>,
  index: ProviderIndex,
): { models: string[]; skipped: SkippedTier[] } {
  const skipped: SkippedTier[] = [];
  const models: string[] = [];
  const seen = new Set<string>();
  const perProviderCap = template.defaults.pick_per_provider;

  for (const tier of combo.tiers) {
    const pick = tier.pick ?? perProviderCap;
    let providerIds: string[] = [];

    if (tier.providers && tier.providers.length > 0) {
      providerIds = [...tier.providers];
    } else if (tier.role) {
      providerIds = providersInRole(tier.role, index, template.roles);
      if (providerIds.length === 0) {
        skipped.push({
          combo: combo.name,
          reason: `role:${tier.role} has no providers configured`,
        });
        continue;
      }
    }

    const result = pickFromProviders(
      providerIds,
      active,
      index,
      pick,
      perProviderCap,
    );
    if (result.skippedInactive.length > 0) {
      const label = tier.role
        ? `role:${tier.role}`
        : `providers:${tier.providers?.join(",")}`;
      skipped.push({
        combo: combo.name,
        reason: `${label}: ${result.skippedInactive.length} provider(s) not connected`,
      });
    }
    for (const id of result.skippedConnected) {
      skipped.push({
        combo: combo.name,
        reason: `provider ${id} has no LLM models in registry`,
      });
    }
    if (result.models.length === 0) {
      skipped.push({
        combo: combo.name,
        reason: `tier (${tier.role ?? tier.providers?.join(",")}) yielded no models`,
      });
      continue;
    }
    for (const m of result.models) {
      if (seen.has(m)) continue;
      seen.add(m);
      models.push(m);
    }
  }

  return { models, skipped };
}

/**
 * Resolve semantic combos.yaml templates into concrete models from connected
 * providers' registry catalogs. Drop empty variants; append 9router-connected.
 */
export function materializeCombosSpec(
  template: CombosTemplateSpec,
  activeProviderIds: Set<string>,
  index: ProviderIndex,
  opts: { includeConnectedCatchAll?: boolean } = {},
): MaterializeResult {
  const includeConnectedCatchAll = opts.includeConnectedCatchAll !== false;
  const skippedTiers: SkippedTier[] = [];
  const droppedCombos: string[] = [];
  const kept: SpecCombo[] = [];
  const connectedOrdered: string[] = [];
  const seenConnected = new Set<string>();

  for (const combo of template.combos) {
    if (combo.name === CONNECTED_COMBO_NAME) continue;

    const { models, skipped } = resolveCombo(
      combo,
      template,
      activeProviderIds,
      index,
    );
    skippedTiers.push(...skipped);

    if (models.length === 0) {
      droppedCombos.push(combo.name);
      continue;
    }

    kept.push({
      name: combo.name,
      description: combo.description,
      models,
      kind: combo.kind ?? template.defaults.kind,
      strategy: combo.strategy ?? template.defaults.strategy,
    });

    for (const m of models) {
      if (seenConnected.has(m)) continue;
      seenConnected.add(m);
      connectedOrdered.push(m);
    }
  }

  if (includeConnectedCatchAll && connectedOrdered.length > 0) {
    kept.push({
      name: CONNECTED_COMBO_NAME,
      description:
        "All models resolved from connected providers (semantic combo order)",
      models: connectedOrdered,
      kind: template.defaults.kind,
      strategy: template.defaults.strategy,
    });
  }

  return {
    spec: {
      version: template.version,
      defaults: {
        strategy: template.defaults.strategy,
        kind: template.defaults.kind,
      },
      combos: kept,
    },
    skippedTiers,
    droppedCombos,
  };
}

/** @deprecated alias — prefer skippedTiers naming */
export type SkippedModel = SkippedTier;

export function formatMaterializeReport(result: MaterializeResult): string {
  const lines: string[] = [];
  const keptNames = result.spec.combos.map((c) => c.name);
  lines.push(
    `Materialized ${keptNames.length} combo(s): ${keptNames.join(", ") || "(none)"}`,
  );

  for (const c of result.spec.combos) {
    lines.push(`  ${c.name}: ${c.models.join(" → ")}`);
  }

  if (result.droppedCombos.length > 0) {
    lines.push(
      `Dropped (no connected providers / empty resolve): ${result.droppedCombos.join(", ")}`,
    );
  }

  if (result.skippedTiers.length > 0) {
    lines.push("Skipped tiers:");
    for (const s of result.skippedTiers) {
      lines.push(`  ${s.combo}: ${s.reason}`);
    }
  }

  return lines.join("\n");
}
