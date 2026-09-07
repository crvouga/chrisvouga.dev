import { pickModel } from './model-picker';
import { currentPlatform } from '../lib/platform/index';
import type { GlobalOpts } from '../lib/cli-opts';
import { confirmOrThrow } from '../lib/cli-opts';
import { resolveModelCatalog } from '../lib/models';
import {
  ensureAutoRouterDefaults,
  ensureSchema,
  getModel,
  getModelSlot,
  getSmallModel,
  listProviders,
  loadConfig,
  removeProvider,
  setModel,
  setModelSlots,
  writeConfig,
  type ModelSlot,
  type OpencodeConfig,
} from '../lib/opencode-config';
import { syncProvidersFromVault } from '../lib/providers-sync';
import {
  muted,
  ok,
  printJson,
  printOk,
  printWarn,
  resolveOutputMode,
  section,
  startSpinner,
} from '../lib/output-and-theme';

type StrictOpts = GlobalOpts & { strict?: boolean | undefined };
type SetModelOpts = GlobalOpts & {
  buildModel?: string | undefined;
  planModel?: string | undefined;
  refreshModels?: boolean | undefined;
};

export async function cmdOpencodeStatus(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const cfg = loadConfig(platform);
  const providers = listProviders(cfg);
  const payload = {
    configPath: `${platform.opencodeDir()}/opencode.json`,
    providers,
    model: getModel(cfg),
    smallModel: getSmallModel(cfg),
    build_model: getModelSlot(cfg, 'build_model'),
    plan_model: getModelSlot(cfg, 'plan_model'),
  };
  if (mode === 'json') {
    printJson({ ok: true, ...payload });
    return;
  }
  section('OpenCode', payload.configPath);
  console.log(
    `  providers (${providers.length}): ${providers.join(', ') || muted('none')}`
  );
  console.log(`  model: ${payload.model ?? muted('unset')}`);
  console.log(`  small_model: ${payload.smallModel ?? muted('unset')}`);
  console.log(`  build_model: ${payload.build_model ?? muted('unset')}`);
  console.log(`  plan_model: ${payload.plan_model ?? muted('unset')}`);
}

export async function cmdOpencodeSync(opts: StrictOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const spinner = startSpinner('Syncing providers from Vault…', mode);
  const result = await syncProvidersFromVault(platform, {
    strict: opts.strict,
  });
  spinner?.succeed('Providers synced');
  if (mode === 'json') {
    printJson({ ok: true, ...result });
    return;
  }
  if (result.configPath.length === 0) {
    printWarn('Vault unavailable — provider config skipped.');
  } else {
    console.log(`Wrote ${result.configPath}`);
  }
  for (const p of result.connected) {
    console.log(`  ${ok('✓')} ${p.id} (${p.vaultKey})`);
  }
  for (const s of result.skipped) {
    console.log(`  ${muted('−')} ${s.id}: ${s.reason.split('\n')[0]}`);
  }
}

type PickSlotOpts = {
  slot: ModelSlot;
  cfg: OpencodeConfig;
  connected: string[];
  refresh: boolean;
  flag: string | undefined;
  opts: GlobalOpts;
};

async function pickSlot(pick: PickSlotOpts): Promise<string> {
  if (pick.flag !== undefined) return pick.flag;
  const platform = currentPlatform();
  const spinner = startSpinner(
    `Loading model catalog for ${pick.slot}…`,
    resolveOutputMode(pick.opts.json)
  );
  const catalog = await resolveModelCatalog(platform, {
    refresh: pick.refresh,
  });
  spinner?.stop();
  return pickModel({
    slot: pick.slot,
    current: getModelSlot(pick.cfg, pick.slot),
    catalog: catalog.models,
    connectedProviders: pick.connected,
    nonInteractive: pick.opts.nonInteractive,
  });
}

export async function cmdOpencodeSetModel(opts: SetModelOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const cfg = loadConfig(platform);
  const connected = listProviders(cfg);
  const refresh = opts.refreshModels === true;
  const build = await pickSlot({
    slot: 'build_model',
    cfg,
    connected,
    refresh,
    flag: opts.buildModel,
    opts,
  });
  const plan = await pickSlot({
    slot: 'plan_model',
    cfg,
    connected,
    refresh,
    flag: opts.planModel,
    opts,
  });
  const path = writeConfig(
    platform,
    ensureSchema(setModelSlots(cfg, { build_model: build, plan_model: plan }))
  );
  if (mode === 'json') {
    printJson({
      ok: true,
      configPath: path,
      build_model: build,
      plan_model: plan,
    });
    return;
  }
  printOk(`Models set (build: ${build}, plan: ${plan}) → ${path}`);
}

export async function cmdOpencodeResetModel(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const cfg = loadConfig(platform);
  const cleared = ensureAutoRouterDefaults(
    ensureSchema(setModel(cfg, null, null))
  );
  const path = writeConfig(platform, cleared);
  const model = getModel(cleared);
  if (mode === 'json') {
    printJson({
      ok: true,
      configPath: path,
      model,
      smallModel: getSmallModel(cleared),
    });
    return;
  }
  printOk(`Model reset → ${path} (model: ${model ?? 'unset'})`);
}

export async function cmdOpencodeDisable(
  provider: string,
  opts: GlobalOpts
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const cfg = loadConfig(platform);
  const { updated, removed } = removeProvider(cfg, provider);
  if (!removed) {
    if (mode === 'json') {
      printJson({ ok: false, error: `provider not in config: ${provider}` });
      process.exit(1);
    }
    throw new Error(`Provider not in config: ${provider}`);
  }
  await confirmOrThrow(
    `Disable provider "${provider}"?`,
    'Removes it from opencode.json (keys stay in Vault).',
    opts
  );
  const path = writeConfig(platform, updated);
  if (mode === 'json') {
    printJson({ ok: true, configPath: path, disabled: provider });
    return;
  }
  printOk(
    `Disabled ${provider} → ${path} (re-enable with \`ws opencode sync\`)`
  );
}
