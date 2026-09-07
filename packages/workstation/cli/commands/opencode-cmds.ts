import { currentPlatform } from '../lib/platform/index';
import type { GlobalOpts } from '../lib/cli-opts';
import { confirmOrThrow } from '../lib/cli-opts';
import {
  ensureAutoRouterDefaults,
  ensureSchema,
  getModel,
  getSmallModel,
  listProviders,
  loadConfig,
  removeProvider,
  setModel,
  writeConfig,
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
type SetModelOpts = GlobalOpts & { smallModel?: string | undefined };

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

export async function cmdOpencodeSetModel(
  model: string,
  opts: SetModelOpts
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const cfg = loadConfig(platform);
  const small = opts.smallModel ?? getSmallModel(cfg) ?? model;
  const path = writeConfig(platform, ensureSchema(setModel(cfg, model, small)));
  if (mode === 'json') {
    printJson({ ok: true, configPath: path, model, smallModel: small });
    return;
  }
  printOk(`Model set to ${model} (small: ${small}) → ${path}`);
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
