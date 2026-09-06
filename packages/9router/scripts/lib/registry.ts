import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { APP_DIR } from "./paths.ts";
import type { CombosSpec, CombosTemplateSpec, ComboRole } from "./combos.ts";
import type { NineRouterClient } from "./client.ts";

export type RegistryModel = {
  id: string;
  name?: string;
  kind?: string;
};

export type RegistryProvider = {
  id: string;
  alias?: string;
  aliases?: string[];
  category?: string;
  hasFree?: boolean;
  models?: RegistryModel[];
};

export type ProviderIndex = {
  /** alias or id → canonical provider id */
  byPrefix: Map<string, string>;
  /** canonical provider id → set of model ids (all kinds) */
  modelsByProvider: Map<string, Set<string>>;
  /** canonical provider id → LLM model ids in registry order */
  modelsByProviderOrdered: Map<string, string[]>;
  /** canonical provider id → registry category */
  categoryByProvider: Map<string, string>;
  /** canonical provider id → preferred prefix for emitting alias/model */
  aliasByProvider: Map<string, string>;
};

export type RegistryIssue =
  | { kind: "unknown_provider"; combo: string; model: string; prefix: string }
  | {
      kind: "unknown_model";
      combo: string;
      model: string;
      providerId: string;
      prefix: string;
    };

export type ProviderConnection = {
  id?: string;
  provider: string;
  name?: string;
  isActive?: boolean | number;
};

function isLlmModel(m: RegistryModel): boolean {
  if (!m?.id) return false;
  if (m.id === "default") return false;
  // Absent kind ⇒ LLM; explicit non-llm kinds excluded
  if (m.kind && m.kind !== "llm") return false;
  return true;
}

/**
 * Load upstream provider registry from the local 9Router app clone.
 */
export async function loadProviderIndex(
  registryPath = join(APP_DIR, "open-sse/providers/registry/index.js"),
): Promise<ProviderIndex> {
  const mod = await import(pathToFileURL(registryPath).href);
  const entries = (mod.default ?? mod) as RegistryProvider[];
  if (!Array.isArray(entries)) {
    throw new Error(`Provider registry at ${registryPath} did not export an array`);
  }

  const byPrefix = new Map<string, string>();
  const modelsByProvider = new Map<string, Set<string>>();
  const modelsByProviderOrdered = new Map<string, string[]>();
  const categoryByProvider = new Map<string, string>();
  const aliasByProvider = new Map<string, string>();

  for (const entry of entries) {
    if (!entry?.id) continue;
    byPrefix.set(entry.id, entry.id);
    if (entry.alias) byPrefix.set(entry.alias, entry.id);
    for (const a of entry.aliases ?? []) byPrefix.set(a, entry.id);

    const preferredAlias = entry.alias ?? entry.id;
    aliasByProvider.set(entry.id, preferredAlias);
    if (entry.category) categoryByProvider.set(entry.id, entry.category);

    const allIds = new Set<string>();
    const llmOrdered: string[] = [];
    for (const m of entry.models ?? []) {
      if (!m?.id) continue;
      allIds.add(m.id);
      if (isLlmModel(m)) llmOrdered.push(m.id);
    }
    modelsByProvider.set(entry.id, allIds);
    modelsByProviderOrdered.set(entry.id, llmOrdered);
  }

  return {
    byPrefix,
    modelsByProvider,
    modelsByProviderOrdered,
    categoryByProvider,
    aliasByProvider,
  };
}

/** LLM model ids for a provider in registry order. */
export function llmModelsFor(
  providerId: string,
  index: ProviderIndex,
): string[] {
  return index.modelsByProviderOrdered.get(providerId) ?? [];
}

/** Safe defaults when combos.yaml omits a role override (avoid aggregators). */
const DEFAULT_ROLE_PROVIDERS: Record<ComboRole, string[]> = {
  free: ["kiro"],
  cheap: ["glm", "minimax"],
  subscription: ["claude", "codex", "cursor", "github"],
};

/**
 * Resolve provider ids for a semantic role.
 * Prefer yaml `roles:` overrides; otherwise use a coding-safe allowlist
 * (registry free/oauth categories include aggregators like api-airforce).
 */
export function providersInRole(
  role: ComboRole,
  index: ProviderIndex,
  roles: CombosTemplateSpec["roles"] = {},
): string[] {
  const override = roles[role];
  const candidates =
    override && override.length > 0
      ? [...override]
      : [...DEFAULT_ROLE_PROVIDERS[role]];

  // Keep only providers that exist in the registry and have LLM models
  return candidates.filter((id) => {
    if (!index.modelsByProvider.has(id) && !index.byPrefix.has(id)) {
      return false;
    }
    const canonical = index.byPrefix.get(id) ?? id;
    return (index.modelsByProviderOrdered.get(canonical)?.length ?? 0) > 0;
  });
}

/** Rank LLM model ids: opus > sonnet > haiku heuristics, else registry order. */
export function rankModels(modelIds: string[]): string[] {
  const score = (id: string): number => {
    const s = id.toLowerCase();
    let n = 0;
    if (/\bopus\b/.test(s)) n += 100;
    else if (/\bsonnet\b/.test(s)) n += 80;
    else if (/\bhaiku\b/.test(s)) n += 40;
    if (/gpt-5/.test(s)) n += 70;
    if (/gpt-4/.test(s)) n += 50;
    if (/glm-5/.test(s)) n += 60;
    if (/minimax/i.test(s) || /^m\d/.test(s)) n += 55;
    if (/thinking|max|codex/.test(s)) n += 10;
    if (/review|spark/.test(s)) n -= 5;
    return n;
  };
  return [...modelIds].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return modelIds.indexOf(a) - modelIds.indexOf(b);
  });
}

export function validateModelsAgainstRegistry(
  spec: CombosSpec,
  index: ProviderIndex,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  for (const combo of spec.combos) {
    for (const model of combo.models) {
      const slash = model.indexOf("/");
      if (slash <= 0) continue;
      const prefix = model.slice(0, slash);
      const modelId = model.slice(slash + 1);
      const providerId = index.byPrefix.get(prefix);
      if (!providerId) {
        issues.push({
          kind: "unknown_provider",
          combo: combo.name,
          model,
          prefix,
        });
        continue;
      }
      const known = index.modelsByProvider.get(providerId);
      if (!known || !known.has(modelId)) {
        issues.push({
          kind: "unknown_model",
          combo: combo.name,
          model,
          providerId,
          prefix,
        });
      }
    }
  }
  return issues;
}

export function formatRegistryIssues(issues: RegistryIssue[]): string {
  if (issues.length === 0) return "All combo models exist in the provider registry.";
  const lines: string[] = [];
  for (const i of issues) {
    if (i.kind === "unknown_provider") {
      lines.push(
        `  ! unknown provider prefix "${i.prefix}" in ${i.combo} (${i.model})`,
      );
    } else {
      lines.push(
        `  ! unknown model "${i.model}" in ${i.combo} (provider ${i.providerId})`,
      );
    }
  }
  return lines.join("\n");
}

/** Collect canonical provider ids referenced by a concrete (materialized) combo spec. */
export function providersReferencedBySpec(
  spec: CombosSpec,
  index: ProviderIndex,
): Set<string> {
  const ids = new Set<string>();
  for (const combo of spec.combos) {
    for (const model of combo.models) {
      const slash = model.indexOf("/");
      if (slash <= 0) continue;
      const prefix = model.slice(0, slash);
      const providerId = index.byPrefix.get(prefix);
      if (providerId) ids.add(providerId);
    }
  }
  return ids;
}

/** Provider ids named by semantic template tiers (roles + explicit providers). */
export function providersReferencedByTemplate(
  template: CombosTemplateSpec,
  index: ProviderIndex,
): Set<string> {
  const ids = new Set<string>();
  for (const combo of template.combos) {
    for (const tier of combo.tiers) {
      if (tier.providers) {
        for (const p of tier.providers) ids.add(p);
      }
      if (tier.role) {
        for (const p of providersInRole(tier.role, index, template.roles)) {
          ids.add(p);
        }
      }
    }
  }
  return ids;
}

export async function fetchProviderConnections(
  client: NineRouterClient,
): Promise<ProviderConnection[]> {
  const data = await client.json<{ connections: ProviderConnection[] }>(
    "/api/providers",
  );
  return data.connections ?? [];
}

/** Providers that have at least one active connection (canonical id). */
export function activeProviderIds(
  connections: ProviderConnection[],
  index: ProviderIndex,
): Set<string> {
  const active = new Set<string>();
  for (const c of connections) {
    const isActive = c.isActive === undefined || c.isActive === true || c.isActive === 1;
    if (!isActive || !c.provider) continue;
    const canonical =
      index.byPrefix.get(c.provider) ??
      (index.modelsByProvider.has(c.provider) ? c.provider : null);
    if (canonical) active.add(canonical);
    else active.add(c.provider);
  }
  return active;
}

export function missingCredentialProviders(
  needed: Set<string>,
  active: Set<string>,
): string[] {
  return [...needed].filter((id) => !active.has(id)).sort();
}
