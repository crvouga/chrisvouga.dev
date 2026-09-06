import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { ROOT } from "./paths.ts";
import type { NineRouterClient } from "./client.ts";

export const COMBOS_SPEC_PATH = join(ROOT, "combos.yaml");

export type ComboStrategyName = "fallback" | "round-robin" | "fusion";

export type ComboRole = "free" | "cheap" | "subscription";

/** Concrete combo after materialize — what the 9Router API stores. */
export type SpecCombo = {
  name: string;
  description?: string;
  models: string[];
  kind?: string | null;
  strategy?: ComboStrategyName;
};

export type ComboTier = {
  /** Semantic provider bucket */
  role?: ComboRole;
  /** Explicit provider ids (use-case coupled to a provider) */
  providers?: string[];
  /** Max models to take across this tier's providers */
  pick?: number;
};

/** Semantic combo template from combos.yaml (no hardcoded models). */
export type TemplateCombo = {
  name: string;
  description?: string;
  tiers: ComboTier[];
  kind?: string | null;
  strategy?: ComboStrategyName;
};

export type CombosTemplateSpec = {
  version: number;
  defaults: {
    strategy: ComboStrategyName;
    kind: string;
    pick_per_provider: number;
  };
  roles: {
    cheap?: string[];
    free?: string[];
    subscription?: string[];
  };
  combos: TemplateCombo[];
};

/** Materialized spec with concrete models — used by sync/diff/API. */
export type CombosSpec = {
  version: number;
  defaults: {
    strategy: ComboStrategyName;
    kind: string;
  };
  combos: SpecCombo[];
};

export type RemoteCombo = {
  id: string;
  name: string;
  kind: string | null;
  models: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type ComboStrategyEntry = {
  fallbackStrategy?: ComboStrategyName;
  judgeModel?: string;
};

export type ComboDiff =
  | { kind: "missing"; name: string; desired: SpecCombo }
  | { kind: "extra"; name: string; remote: RemoteCombo }
  | {
      kind: "drifted";
      name: string;
      desired: SpecCombo;
      remote: RemoteCombo;
      changes: string[];
    };

const VALID_NAME = /^[a-zA-Z0-9_.\-]+$/;
const VALID_STRATEGIES = new Set<ComboStrategyName>([
  "fallback",
  "round-robin",
  "fusion",
]);
const VALID_ROLES = new Set<ComboRole>(["free", "cheap", "subscription"]);

function modelsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((m, i) => m === b[i]);
}

type RawYaml = {
  version?: number;
  defaults?: {
    strategy?: string;
    kind?: string;
    pick_per_provider?: number;
  };
  roles?: {
    cheap?: string[];
    free?: string[];
    subscription?: string[];
  };
  combos?: Array<{
    name?: string;
    description?: string;
    models?: string[];
    tiers?: ComboTier[];
    kind?: string;
    strategy?: string;
  }>;
};

/** Load semantic combos.yaml (v2). Rejects hardcoded models lists. */
export function loadCombosSpec(path = COMBOS_SPEC_PATH): CombosTemplateSpec {
  const raw = parseYaml(readFileSync(path, "utf8")) as RawYaml;
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid combos spec at ${path}`);
  }
  if (!Array.isArray(raw.combos)) {
    throw new Error(`combos.yaml must have a combos: array`);
  }

  const version = Number(raw.version) || 0;
  if (version < 2) {
    throw new Error(
      `combos.yaml must be version: 2 (semantic tiers). Found version ${version || 1}.`,
    );
  }

  const defaults = {
    strategy: (raw.defaults?.strategy ?? "fallback") as ComboStrategyName,
    kind: raw.defaults?.kind ?? "llm",
    pick_per_provider: Math.max(1, Number(raw.defaults?.pick_per_provider) || 2),
  };
  if (!VALID_STRATEGIES.has(defaults.strategy)) {
    throw new Error(`Invalid defaults.strategy: ${defaults.strategy}`);
  }

  const roles = {
    cheap: Array.isArray(raw.roles?.cheap) ? [...raw.roles!.cheap!] : undefined,
    free: Array.isArray(raw.roles?.free) ? [...raw.roles!.free!] : undefined,
    subscription: Array.isArray(raw.roles?.subscription)
      ? [...raw.roles!.subscription!]
      : undefined,
  };

  const seen = new Set<string>();
  const combos: TemplateCombo[] = [];
  for (const c of raw.combos) {
    if (!c?.name || typeof c.name !== "string") {
      throw new Error("Each combo needs a string name");
    }
    if (!VALID_NAME.test(c.name)) {
      throw new Error(
        `Invalid combo name "${c.name}" (only letters, numbers, -, _, .)`,
      );
    }
    if (seen.has(c.name)) {
      throw new Error(`Duplicate combo name: ${c.name}`);
    }
    seen.add(c.name);

    if (Array.isArray(c.models) && c.models.length > 0) {
      throw new Error(
        `Combo "${c.name}" must not hardcode models: — use tiers: with role/providers instead`,
      );
    }
    if (!Array.isArray(c.tiers) || c.tiers.length === 0) {
      throw new Error(`Combo "${c.name}" needs a non-empty tiers list`);
    }

    const tiers: ComboTier[] = [];
    for (const t of c.tiers) {
      if (!t || typeof t !== "object") {
        throw new Error(`Combo "${c.name}" has an invalid tier`);
      }
      if (t.role && !VALID_ROLES.has(t.role)) {
        throw new Error(
          `Combo "${c.name}" has invalid role "${t.role}" (use free|cheap|subscription)`,
        );
      }
      if (!t.role && (!t.providers || t.providers.length === 0)) {
        throw new Error(
          `Combo "${c.name}" tier needs role: or providers:`,
        );
      }
      if (t.providers) {
        for (const p of t.providers) {
          if (typeof p !== "string" || !p.trim()) {
            throw new Error(`Combo "${c.name}" has invalid provider id in tiers`);
          }
        }
      }
      tiers.push({
        role: t.role,
        providers: t.providers ? [...t.providers] : undefined,
        pick: t.pick !== undefined ? Math.max(1, Number(t.pick)) : undefined,
      });
    }

    const strategy = (c.strategy ?? defaults.strategy) as ComboStrategyName;
    if (!VALID_STRATEGIES.has(strategy)) {
      throw new Error(`Combo "${c.name}" has invalid strategy: ${strategy}`);
    }
    combos.push({
      name: c.name,
      description: c.description,
      tiers,
      kind: c.kind ?? defaults.kind,
      strategy,
    });
  }

  return {
    version,
    defaults,
    roles,
    combos,
  };
}

export function desiredStrategy(
  combo: SpecCombo | TemplateCombo,
  defaults: { strategy: ComboStrategyName },
): ComboStrategyName {
  return combo.strategy ?? defaults.strategy;
}

/** Diff desired vs remote LLM combos (ignores non-llm kinds). */
export function diffCombos(
  spec: CombosSpec,
  remoteAll: RemoteCombo[],
): ComboDiff[] {
  const remote = remoteAll.filter((c) => !c.kind || c.kind === "llm");
  const byName = new Map(remote.map((c) => [c.name, c]));
  const diffs: ComboDiff[] = [];

  for (const desired of spec.combos) {
    const r = byName.get(desired.name);
    if (!r) {
      diffs.push({ kind: "missing", name: desired.name, desired });
      continue;
    }
    const changes: string[] = [];
    if (!modelsEqual(desired.models, r.models ?? [])) {
      changes.push(
        `models: [${(r.models ?? []).join(", ")}] → [${desired.models.join(", ")}]`,
      );
    }
    const normalizeKind = (k: string | null | undefined) =>
      !k || k === "llm" ? "llm" : k;
    const wantKind = normalizeKind(desired.kind);
    const gotKind = normalizeKind(r.kind);
    if (wantKind !== gotKind) {
      changes.push(`kind: ${gotKind} → ${wantKind}`);
    }
    if (changes.length > 0) {
      diffs.push({
        kind: "drifted",
        name: desired.name,
        desired,
        remote: r,
        changes,
      });
    }
    byName.delete(desired.name);
  }

  for (const r of byName.values()) {
    diffs.push({ kind: "extra", name: r.name, remote: r });
  }

  return diffs;
}

export function formatDiffs(diffs: ComboDiff[]): string {
  if (diffs.length === 0) return "All combos match the spec.";
  const lines: string[] = [];
  for (const d of diffs) {
    if (d.kind === "missing") {
      lines.push(`  + missing  ${d.name}  (${d.desired.models.join(" → ")})`);
    } else if (d.kind === "extra") {
      lines.push(`  ? extra    ${d.name}  (not in combos.yaml)`);
    } else {
      lines.push(`  ~ drifted  ${d.name}`);
      for (const c of d.changes) lines.push(`      ${c}`);
    }
  }
  return lines.join("\n");
}

export async function fetchCombos(
  client: NineRouterClient,
): Promise<RemoteCombo[]> {
  const data = await client.json<{ combos: RemoteCombo[] }>("/api/combos");
  return data.combos ?? [];
}

export async function createCombo(
  client: NineRouterClient,
  combo: SpecCombo,
): Promise<RemoteCombo> {
  return client.json<RemoteCombo>("/api/combos", {
    method: "POST",
    body: JSON.stringify({
      name: combo.name,
      models: combo.models,
      kind: combo.kind ?? "llm",
    }),
  });
}

export async function updateCombo(
  client: NineRouterClient,
  id: string,
  combo: SpecCombo,
): Promise<RemoteCombo> {
  return client.json<RemoteCombo>(`/api/combos/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: combo.name,
      models: combo.models,
      kind: combo.kind ?? "llm",
    }),
  });
}

export async function deleteCombo(
  client: NineRouterClient,
  id: string,
): Promise<void> {
  await client.json(`/api/combos/${id}`, { method: "DELETE" });
}

export async function fetchComboStrategies(
  client: NineRouterClient,
): Promise<Record<string, ComboStrategyEntry>> {
  const settings = await client.json<{
    comboStrategies?: Record<string, ComboStrategyEntry>;
  }>("/api/settings");
  return settings.comboStrategies ?? {};
}

/**
 * Merge desired strategies into settings.comboStrategies.
 * Default "fallback" entries are omitted (upstream drops them when empty).
 */
export function buildStrategyPatch(
  spec: CombosSpec,
  existing: Record<string, ComboStrategyEntry>,
  prune: boolean,
): Record<string, ComboStrategyEntry> {
  const next: Record<string, ComboStrategyEntry> = { ...existing };
  const desiredNames = new Set(spec.combos.map((c) => c.name));

  for (const combo of spec.combos) {
    const strategy = desiredStrategy(combo, spec.defaults);
    if (strategy === "fallback") {
      delete next[combo.name];
    } else {
      next[combo.name] = {
        ...(next[combo.name] ?? {}),
        fallbackStrategy: strategy,
      };
    }
  }

  if (prune) {
    for (const name of Object.keys(next)) {
      if (!desiredNames.has(name)) delete next[name];
    }
  }

  return next;
}

export async function patchComboStrategies(
  client: NineRouterClient,
  comboStrategies: Record<string, ComboStrategyEntry>,
): Promise<void> {
  await client.json("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({ comboStrategies }),
  });
}
