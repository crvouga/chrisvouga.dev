import { createAuthedClient } from "../../scripts/lib/client.ts";
import {
  materializeCombosSpec,
  formatMaterializeReport,
} from "../../scripts/lib/combo-materialize.ts";
import {
  buildStrategyPatch,
  createCombo,
  deleteCombo,
  diffCombos,
  fetchComboStrategies,
  fetchCombos,
  formatDiffs,
  loadCombosSpec,
  patchComboStrategies,
  updateCombo,
  desiredStrategy,
  type ComboDiff,
  type CombosSpec,
  type CombosTemplateSpec,
} from "../../scripts/lib/combos.ts";
import {
  activeProviderIds,
  fetchProviderConnections,
  formatRegistryIssues,
  loadProviderIndex,
  validateModelsAgainstRegistry,
  type ProviderIndex,
} from "../../scripts/lib/registry.ts";
import { askConfirm } from "../prompt.ts";
import { CommandError, type Command } from "../types.ts";

async function applyDiffs(
  client: Awaited<ReturnType<typeof createAuthedClient>>,
  diffs: ComboDiff[],
  prune: boolean,
): Promise<void> {
  for (const d of diffs) {
    if (d.kind === "missing") {
      await createCombo(client, d.desired);
      console.log(`  created  ${d.name}`);
    } else if (d.kind === "drifted") {
      await updateCombo(client, d.remote.id, d.desired);
      console.log(`  updated  ${d.name}`);
    } else if (d.kind === "extra") {
      if (!prune) continue;
      await deleteCombo(client, d.remote.id);
      console.log(`  pruned   ${d.name}`);
    }
  }
}

async function loadDesiredSpec(opts: {
  client: Awaited<ReturnType<typeof createAuthedClient>>;
  index: ProviderIndex;
}): Promise<{ template: CombosTemplateSpec; desired: CombosSpec }> {
  const template = loadCombosSpec();
  const connections = await fetchProviderConnections(opts.client);
  const active = activeProviderIds(connections, opts.index);
  console.log(
    `==> Connected providers (${active.size}): ${[...active].sort().join(", ") || "(none)"}`,
  );

  const result = materializeCombosSpec(template, active, opts.index);
  console.log(`==> ${formatMaterializeReport(result).split("\n").join("\n    ")}`);
  return { template, desired: result.spec };
}

export async function syncCombos(): Promise<void> {
  const dryRun = await askConfirm(
    "Dry run only?",
    "Show the combo diff without writing changes to 9Router.",
    false,
  );
  const prune = await askConfirm(
    "Prune remote combos?",
    "Delete remote LLM combos not in the materialized set (dropped empty variants).",
    true,
  );

  const index = await loadProviderIndex();
  const client = await createAuthedClient();
  const { desired } = await loadDesiredSpec({ client, index });

  if (desired.combos.length === 0) {
    throw new CommandError(
      "No combos to sync — connect at least one provider used by combos.yaml roles/tiers, then retry.",
    );
  }

  const remote = await fetchCombos(client);
  const diffs = diffCombos(desired, remote);
  const actionable = diffs.filter((d) => d.kind !== "extra" || prune);

  console.log(`==> Combos vs ${client.baseUrl}`);
  console.log(formatDiffs(diffs));

  if (dryRun) {
    if (actionable.length > 0) {
      console.log(
        `\nDry run — ${actionable.length} actionable change(s); nothing written.`,
      );
    } else {
      console.log("\nDry run — no actionable changes.");
    }
    return;
  }

  if (actionable.length > 0) {
    console.log("\n==> Applying combo upserts");
    await applyDiffs(client, diffs, prune);
  }

  const existing = await fetchComboStrategies(client);
  const next = buildStrategyPatch(desired, existing, prune);
  const before = JSON.stringify(existing);
  const after = JSON.stringify(next);
  if (before !== after) {
    console.log("==> Patching comboStrategies");
    await patchComboStrategies(client, next);
  } else {
    console.log("==> comboStrategies already match");
  }

  const verify = diffCombos(desired, await fetchCombos(client)).filter(
    (d) => d.kind !== "extra" || prune,
  );
  if (verify.length > 0) {
    throw new CommandError(
      `Combos still drifted after sync:\n${formatDiffs(verify)}`,
    );
  }

  console.log(`OK — ${desired.combos.length} combos in sync`);
}

export async function checkCombos(): Promise<void> {
  const index = await loadProviderIndex();
  const client = await createAuthedClient();
  const { desired } = await loadDesiredSpec({ client, index });

  console.log(`==> Registry check (materialized models)`);
  const registryIssues = validateModelsAgainstRegistry(desired, index);
  console.log(formatRegistryIssues(registryIssues));

  if (desired.combos.length === 0) {
    throw new CommandError(
      "No materialized combos — connect providers used by combos.yaml, then Combos: Sync.",
    );
  }

  const remote = await fetchCombos(client);
  const diffs = diffCombos(desired, remote);
  const strategies = await fetchComboStrategies(client);

  console.log(`\n==> Check combos @ ${client.baseUrl} (materialized)`);
  console.log(formatDiffs(diffs));

  let strategyDrift = 0;
  for (const combo of desired.combos) {
    const want = desiredStrategy(combo, desired.defaults);
    const got = strategies[combo.name]?.fallbackStrategy ?? "fallback";
    if (want !== got) {
      strategyDrift += 1;
      console.log(`  ~ strategy ${combo.name}: ${got} → ${want}`);
    }
  }

  console.log(`\n==> Provider credentials`);
  console.log(
    "Semantic mode: unconnected providers skip tiers (not a hard fail).",
  );
  console.log(
    `Active combos: ${desired.combos.length} (models resolved from connected providers only).`,
  );

  const blocking = diffs.filter(
    (d) => d.kind === "missing" || d.kind === "drifted",
  );
  const failed =
    blocking.length > 0 || strategyDrift > 0 || registryIssues.length > 0;

  const extras = diffs.filter((d) => d.kind === "extra");
  if (failed) {
    if (extras.length > 0) {
      console.log(
        `\nNote: ${extras.length} extra remote combo(s) (use Combos: Sync with prune to remove)`,
      );
    }
    throw new CommandError(
      "Combo check failed — see registry or drift vs materialized desired above.",
    );
  }

  if (extras.length > 0) {
    console.log(
      `\nOK (materialized spec satisfied). ${extras.length} extra remote combo(s) not in desired set.`,
    );
  } else {
    console.log(
      `\nOK — ${desired.combos.length} materialized combos match remote + registry`,
    );
  }
}

export const combosCommands: Command[] = [
  {
    id: "sync-combos",
    name: "Combos: Sync",
    description:
      "Resolve semantic combos.yaml tiers from connected providers and upsert",
    run: syncCombos,
  },
  {
    id: "check-combos",
    name: "Combos: Check",
    description:
      "Validate materialized combos against registry and remote",
    run: checkCombos,
  },
];
