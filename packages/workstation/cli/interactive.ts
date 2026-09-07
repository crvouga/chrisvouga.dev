import { currentPlatform } from './lib/platform/index';
import { workstationRoot } from './lib/paths';
import { describeLink, managedLinks } from './lib/links';
import { listProviders, loadConfig } from './lib/opencode-config';
import { providerStatuses } from './lib/providers-sync';
import { searchableMenu, type MenuCommand } from './menu';
import { isExitPromptError } from './lib/cli-opts';
import { askCheckbox, askSelect, NonInteractiveError } from './lib/prompt';
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
  cmdOpenRouterModels,
  cmdOpenRouterStatus,
} from './commands/openrouter-cmds';
import { cmdSoundsConfigure, cmdSoundsList } from './commands/sounds-cmds';
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
  console.log(
    `  ${muted('Run "opencode › Sync providers from Vault" to apply.')}`
  );
}

async function interactiveSetModel(): Promise<void> {
  await cmdOpencodeSetModel({});
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
      { name: 'Configure sounds…', value: 'sounds' },
    ],
  });
  if (action === 'enable') await cmdNotificationsEnable({});
  else if (action === 'disable') await cmdNotificationsDisable({ yes: true });
  else if (action === 'sounds') await cmdSoundsConfigure({});
  else await cmdNotificationsTest('finished', {});
}

type Item = {
  id: string;
  domain: 'ws' | 'opencode' | 'openrouter';
  name: string;
  description: string;
  run: () => Promise<void>;
};

function wsItems(): Item[] {
  return [
    {
      id: 'status',
      domain: 'ws',
      name: 'ws › Status',
      description: 'Show ws + OpenCode + Vault state',
      run: () => cmdStatus({}),
    },
    {
      id: 'sync',
      domain: 'ws',
      name: 'ws › Sync workstation',
      description: 'Links + sounds + notifier + providers',
      run: () => cmdSync({}),
    },
    {
      id: 'doctor',
      domain: 'ws',
      name: 'ws › Doctor',
      description: 'Checks with fixes',
      run: () => cmdDoctor({}),
    },
    {
      id: 'backup',
      domain: 'ws',
      name: 'ws › Backup config',
      description: 'Timestamped backup of opencode.json',
      run: () => cmdBackup({}),
    },
    {
      id: 'install',
      domain: 'ws',
      name: 'ws › Reinstall launcher',
      description: 'Refresh the global ws command',
      run: () => cmdInstall({ yes: true }),
    },
  ];
}

function opencodeItems(): Item[] {
  return [
    {
      id: 'opencode-status',
      domain: 'opencode',
      name: 'opencode › Status',
      description: 'Config, providers, model',
      run: () => cmdOpencodeStatus({}),
    },
    {
      id: 'providers-sync',
      domain: 'opencode',
      name: 'opencode › providers › Sync from Vault',
      description: 'Merge every valid Vault key into opencode.json',
      run: () => cmdOpencodeSync({}),
    },
    {
      id: 'providers-review',
      domain: 'opencode',
      name: 'opencode › providers › Review',
      description: 'Vault-backed status for every provider',
      run: interactiveProvidersPick,
    },
    {
      id: 'set-model',
      domain: 'opencode',
      name: 'opencode › Set build + plan models',
      description: 'Searchable model picker for build_model + plan_model',
      run: interactiveSetModel,
    },
    {
      id: 'disable-provider',
      domain: 'opencode',
      name: 'opencode › Disable a provider',
      description: 'Remove from opencode.json (keys stay in Vault)',
      run: interactiveDisableProvider,
    },
    {
      id: 'notifications',
      domain: 'opencode',
      name: 'opencode › notifications › Enable / disable / test',
      description: 'Click-to-focus notification plugin',
      run: interactiveToggleNotifications,
    },
    {
      id: 'sounds-list',
      domain: 'opencode',
      name: 'opencode › notifications › sounds › List',
      description: 'Per-kind sounds + available system sounds',
      run: () => cmdSoundsList({}),
    },
    {
      id: 'sounds-configure',
      domain: 'opencode',
      name: 'opencode › notifications › sounds › Configure…',
      description: 'Pick a sound per event, with preview',
      run: () => cmdSoundsConfigure({}),
    },
  ];
}

function openrouterItems(): Item[] {
  return [
    {
      id: 'openrouter-status',
      domain: 'openrouter',
      name: 'openrouter › Status',
      description: 'Key state + catalog source',
      run: () => cmdOpenRouterStatus({}),
    },
    {
      id: 'openrouter-models',
      domain: 'openrouter',
      name: 'openrouter › Browse models',
      description: 'Live catalog used by opencode set-model',
      run: () => cmdOpenRouterModels({}),
    },
  ];
}

function menuItems(): Item[] {
  return [
    ...wsItems(),
    ...opencodeItems(),
    ...openrouterItems(),
    {
      id: 'exit',
      domain: 'ws',
      name: 'Exit',
      description: 'Quit ws',
      run: async () => {},
    },
  ];
}

function toMenuCommands(items: Item[]): MenuCommand[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    description: `[${i.domain}] ${i.description}`,
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
