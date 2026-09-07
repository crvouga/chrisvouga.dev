import { currentPlatform } from './lib/platform/index';
import { workstationRoot } from './lib/paths';
import { describeLink, managedLinks } from './lib/links';
import { listProviders, loadConfig, getModel } from './lib/opencode-config';
import { providerStatuses } from './lib/providers-sync';
import { pushHistory } from './history';
import { searchableMenu, type MenuCommand } from './menu';
import { isExitPromptError } from './lib/cli-opts';
import {
  askCheckbox,
  askInput,
  askSelect,
  NonInteractiveError,
} from './lib/prompt';
import {
  banner,
  cancelled,
  fail,
  goodbye,
  muted,
  printWarn,
  section,
} from './lib/output-and-theme';
import { cmdBackup } from './commands/backup-cmds';
import { cmdDoctor } from './commands/doctor-cmd';
import { cmdInstall } from './commands/install-cmds';
import {
  cmdOpencodeDisable,
  cmdOpencodeSetModel,
  cmdOpencodeStatus,
  cmdOpencodeSync,
} from './commands/opencode-cmds';
import {
  cmdNotificationsDisable,
  cmdNotificationsEnable,
  cmdNotificationsTest,
} from './commands/notifications-cmds';
import {
  cmdSoundsReset,
  cmdSoundsSet,
  readSounds,
} from './commands/sounds-cmds';
import { cmdStatus } from './commands/status-cmd';
import { cmdSync } from './commands/sync-cmd';

async function interactiveProvidersPick(): Promise<void> {
  const statuses = await providerStatuses();
  const picked = await askCheckbox({
    message: 'Providers',
    description: 'Review Vault-backed connections (sync to apply)',
    choices: statuses.map((p) => ({
      name: `${p.id} [${p.state}]`,
      value: p.id,
      description: `${p.name} · ${p.vaultKey} · ${p.detail}`,
      checked: false,
    })),
  });
  if (picked.length === 0) return;
  console.log(`  ${muted(picked.join(', '))}`);
  console.log(`  ${muted('Run "Sync providers from Vault" to apply.')}`);
}

async function interactiveSetModel(): Promise<void> {
  const cfg = loadConfig(currentPlatform());
  const current = getModel(cfg) ?? 'openrouter/openrouter/auto';
  const model = await askInput({
    message: 'Default model',
    description: `Current: ${current} (e.g. openrouter/openrouter/auto)`,
    default: current,
  });
  await cmdOpencodeSetModel(model, {});
}

async function interactiveDisableProvider(): Promise<void> {
  const providers = listProviders(loadConfig(currentPlatform()));
  if (providers.length === 0) {
    printWarn('No providers in local config — sync first.');
    return;
  }
  const picked = await askSelect({
    message: 'Disable provider',
    description: 'Removes it from opencode.json (keys stay in Vault)',
    choices: providers.map((p) => ({ name: p, value: p })),
  });
  await cmdOpencodeDisable(picked, { yes: true });
}

async function interactiveToggleNotifications(): Promise<void> {
  const platform = currentPlatform();
  const plugin = managedLinks(workstationRoot(), platform).find((l) =>
    l.label.includes('notification plugin')
  );
  const enabled = plugin !== undefined && describeLink(plugin).state === 'ok';
  const action = await askSelect({
    message: 'Notifications',
    description: enabled ? 'Currently enabled' : 'Currently disabled',
    choices: [
      {
        name: enabled ? 'Disable' : 'Enable',
        value: enabled ? 'disable' : 'enable',
      },
      { name: 'Send test notification', value: 'test' },
    ],
  });
  if (action === 'enable') await cmdNotificationsEnable({});
  else if (action === 'disable') await cmdNotificationsDisable({ yes: true });
  else await cmdNotificationsTest('finished', {});
}

async function interactiveSounds(): Promise<void> {
  const sounds = readSounds(currentPlatform());
  const kind = await askSelect({
    message: 'Notification sounds',
    description: 'Pick a kind to change, or reset to defaults',
    choices: [
      ...Object.entries(sounds).map(([k, v]) => ({
        name: `${k} (${v})`,
        value: k,
      })),
      { name: 'Reset all to defaults', value: '__reset' },
    ],
  });
  if (kind === '__reset') {
    await cmdSoundsReset({});
    return;
  }
  const sound = await askInput({
    message: `Sound for ${kind}`,
    description: 'macOS system sound name (e.g. Purr, Pop, Ping, Bottle)',
    default: sounds[kind] ?? '',
  });
  await cmdSoundsSet(kind, sound, {});
}

type Item = {
  id: string;
  name: string;
  description: string;
  run: () => Promise<void>;
};

function coreItems(): Item[] {
  return [
    {
      id: 'status',
      name: 'Status',
      description: 'Show ws + OpenCode + Vault state',
      run: () => cmdStatus({}),
    },
    {
      id: 'sync',
      name: 'Sync workstation',
      description: 'Links + sounds + notifier + providers',
      run: () => cmdSync({}),
    },
  ];
}

function opencodeItemsSplit(): Item[] {
  return [
    {
      id: 'opencode-status',
      name: 'OpenCode status',
      description: 'Config, providers, model',
      run: () => cmdOpencodeStatus({}),
    },
    {
      id: 'providers-sync',
      name: 'Sync providers from Vault',
      description: 'Merge every valid Vault key into opencode.json',
      run: () => cmdOpencodeSync({}),
    },
    {
      id: 'providers-review',
      name: 'Review providers',
      description: 'Vault-backed status for every provider',
      run: interactiveProvidersPick,
    },
    {
      id: 'set-model',
      name: 'Set default model',
      description: 'Change model + small_model',
      run: interactiveSetModel,
    },
    {
      id: 'disable-provider',
      name: 'Disable a provider',
      description: 'Remove from opencode.json (keys stay in Vault)',
      run: interactiveDisableProvider,
    },
    {
      id: 'notifications',
      name: 'Notifications',
      description: 'Enable / disable / test',
      run: interactiveToggleNotifications,
    },
    {
      id: 'sounds',
      name: 'Notification sounds',
      description: 'Per-kind sounds + reset',
      run: interactiveSounds,
    },
  ];
}

function opsItems(): Item[] {
  return [
    {
      id: 'doctor',
      name: 'Doctor',
      description: 'Checks with fixes',
      run: () => cmdDoctor({}),
    },
    {
      id: 'backup',
      name: 'Backup config',
      description: 'Timestamped backup of opencode.json',
      run: () => cmdBackup({}),
    },
    {
      id: 'install',
      name: 'Reinstall ws launcher',
      description: 'Refresh the global ws command',
      run: () => cmdInstall({ yes: true }),
    },
  ];
}

function menuItems(): Item[] {
  return [
    ...coreItems(),
    ...opencodeItemsSplit(),
    ...opsItems(),
    { id: 'exit', name: 'Exit', description: 'Quit ws', run: async () => {} },
  ];
}

function toMenuCommands(items: Item[]): MenuCommand[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    run: i.run,
  }));
}

async function runOnce(items: Item[]): Promise<boolean> {
  let selected: MenuCommand | null = null;
  try {
    selected = await searchableMenu(toMenuCommands(items));
  } catch (err) {
    if (isExitPromptError(err)) {
      console.log('');
      goodbye();
      process.exit(0);
    }
    throw err;
  }
  if (selected === null || selected.id === 'exit') {
    goodbye();
    process.exit(0);
  }
  const found = items.find((i) => i.id === selected?.id);
  if (found === undefined) return true;
  pushHistory(found.id);
  section(found.name, found.description);
  try {
    await found.run();
  } catch (err) {
    if (isExitPromptError(err)) cancelled();
    else if (err instanceof NonInteractiveError) fail(err.message);
    else fail(err instanceof Error ? err.message : String(err));
  }
  console.log('');
  return true;
}

export async function runInteractive(): Promise<void> {
  banner();
  const items = menuItems();
  for (;;) {
    await runOnce(items);
  }
}
