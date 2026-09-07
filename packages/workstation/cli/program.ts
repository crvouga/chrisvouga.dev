import { Command } from 'commander';

import { cmdBackup, cmdBackups, cmdReset } from './commands/backup-cmds';
import { cmdDoctor } from './commands/doctor-cmd';
import { cmdInstall, cmdUninstall } from './commands/install-cmds';
import {
  cmdOpencodeDisable,
  cmdOpencodeResetModel,
  cmdOpencodeSetModel,
  cmdOpencodeStatus,
  cmdOpencodeSync,
} from './commands/opencode-cmds';
import {
  cmdNotificationsDisable,
  cmdNotificationsEnable,
  cmdNotificationsStatus,
  cmdNotificationsTest,
} from './commands/notifications-cmds';
import { cmdProvidersList } from './commands/providers-cmds';
import {
  cmdSoundsList,
  cmdSoundsReset,
  cmdSoundsSet,
} from './commands/sounds-cmds';
import { cmdStatus } from './commands/status-cmd';
import { cmdSync } from './commands/sync-cmd';
import { resolveVaultConfig } from './lib/vault-config';
import type { GlobalOpts } from './lib/cli-opts';
import { readVersion } from './lib/cli-opts';
import { printJson, resolveOutputMode, section } from './lib/output-and-theme';

function registerCore(program: Command, globals: () => GlobalOpts): void {
  program
    .command('status')
    .description('Show ws + OpenCode + Vault state')
    .action(async () => cmdStatus(globals()));
  program
    .command('doctor')
    .description('Run checks with actionable fixes')
    .option('--fix', 'Auto-fix by running sync')
    .action(async (opts: { fix?: boolean | undefined }) =>
      cmdDoctor({ ...globals(), fix: opts.fix })
    );
  program
    .command('sync')
    .description('Converge home directory to the checked-in spec')
    .option('--strict', 'Fail when Vault is unavailable')
    .action(async (opts: { strict?: boolean | undefined }) =>
      cmdSync({ ...globals(), strict: opts.strict })
    );
}

function registerOpencode(program: Command, globals: () => GlobalOpts): void {
  const opencode = program
    .command('opencode')
    .description('OpenCode config commands');
  opencode
    .command('status')
    .description('Show config, providers, model')
    .action(async () => cmdOpencodeStatus(globals()));
  opencode
    .command('sync')
    .description('Merge every valid Vault key into opencode.json')
    .option('--strict', 'Fail when Vault is unavailable')
    .action(async (opts: { strict?: boolean | undefined }) =>
      cmdOpencodeSync({ ...globals(), strict: opts.strict })
    );
  opencode
    .command('set-model')
    .description('Pick build_model + plan_model from the model catalog')
    .option('--build-model <ref>', 'Build model ref (skips picker)')
    .option('--plan-model <ref>', 'Plan model ref (skips picker)')
    .option('--refresh-models', 'Refresh the cached model catalog')
    .action(
      async (opts: {
        buildModel?: string | undefined;
        planModel?: string | undefined;
        refreshModels?: boolean | undefined;
      }) =>
        cmdOpencodeSetModel({
          ...globals(),
          buildModel: opts.buildModel,
          planModel: opts.planModel,
          refreshModels: opts.refreshModels,
        })
    );
  opencode
    .command('reset-model')
    .description(
      'Clear explicit model (restores Auto Router default when connected)'
    )
    .action(async () => cmdOpencodeResetModel(globals()));
  opencode
    .command('disable <provider>')
    .description('Remove a provider from opencode.json (keys stay in Vault)')
    .action(async (provider: string) =>
      cmdOpencodeDisable(provider, globals())
    );
  opencode
    .command('list')
    .description('List providers in local config')
    .action(async () => cmdOpencodeStatus(globals()));
}

function registerProviders(program: Command, globals: () => GlobalOpts): void {
  const providers = program
    .command('providers')
    .description('Vault-backed provider commands');
  providers
    .command('list')
    .description('Vault status for every catalogued provider')
    .action(async () => cmdProvidersList(globals()));
  providers
    .command('sync')
    .description('Merge every valid Vault key into opencode.json')
    .option('--strict', 'Fail when Vault is unavailable')
    .action(async (opts: { strict?: boolean | undefined }) =>
      cmdOpencodeSync({ ...globals(), strict: opts.strict })
    );
}

function registerNotifications(
  program: Command,
  globals: () => GlobalOpts
): void {
  const notifications = program
    .command('notifications')
    .description('Notification plugin commands');
  notifications
    .command('status')
    .description('Show enabled state + capabilities')
    .action(async () => cmdNotificationsStatus(globals()));
  notifications
    .command('enable')
    .description('Symlink plugin + write sounds')
    .action(async () => cmdNotificationsEnable(globals()));
  notifications
    .command('disable')
    .description('Remove plugin symlink')
    .action(async () => cmdNotificationsDisable(globals()));
  notifications
    .command('test')
    .description('Post a test notification')
    .option('--kind <kind>', 'finished|question|permission|error', 'finished')
    .action(async (opts: { kind: string }) =>
      cmdNotificationsTest(opts.kind, globals())
    );
}

function registerSoundsBackup(
  program: Command,
  globals: () => GlobalOpts
): void {
  const sounds = program
    .command('sounds')
    .description('Notification sound commands');
  sounds
    .command('list')
    .description('Show per-kind sounds')
    .action(async () => cmdSoundsList(globals()));
  sounds
    .command('set <kind> <sound>')
    .description('Set the sound for a kind')
    .action(async (kind: string, sound: string) =>
      cmdSoundsSet(kind, sound, globals())
    );
  sounds
    .command('reset')
    .description('Reset all sounds to defaults')
    .action(async () => cmdSoundsReset(globals()));

  program
    .command('backup')
    .description('Timestamped backup of opencode.json')
    .action(async () => cmdBackup(globals()));
  program
    .command('backups')
    .description('List backups')
    .action(async () => cmdBackups(globals()));
  program
    .command('reset')
    .description('Backup then remove generated opencode.json')
    .action(async () => cmdReset(globals()));
}

function registerLifecycle(program: Command, globals: () => GlobalOpts): void {
  program
    .command('install')
    .description('(Re)install the global ws launcher + sync')
    .action(async () => cmdInstall(globals()));
  program
    .command('uninstall')
    .description('Remove the global ws launcher')
    .option('--remove-links', 'Also remove managed symlinks')
    .action(async (opts: { removeLinks?: boolean | undefined }) =>
      cmdUninstall({ ...globals(), removeLinks: opts.removeLinks })
    );
  program
    .command('vault')
    .description('Show resolved Vault coordinates')
    .action(async () => {
      const mode = resolveOutputMode(globals().json);
      const vault = resolveVaultConfig();
      if (mode === 'json') {
        printJson({ ok: true, ...vault });
        return;
      }
      section('Vault', vault.addr);
      console.log(
        `  path: ${vault.mount}/data/${vault.project}/${vault.config}`
      );
    });
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('ws')
    .description(
      'Workstation CLI — one stop shop for local machine + OpenCode config'
    )
    .version(readVersion(), '--version', 'Show ws version')
    .option(
      '--json',
      'Machine-readable JSON output (LLM-friendly, secrets redacted)'
    )
    .option('--yes', 'Skip confirmations')
    .option('--non-interactive', 'Fail instead of prompting')
    .showHelpAfterError('(add --help for usage)');

  const globals = (): GlobalOpts => {
    const o = program.opts() as GlobalOpts;
    return { json: o.json, yes: o.yes, nonInteractive: o.nonInteractive };
  };

  registerCore(program, globals);
  registerOpencode(program, globals);
  registerProviders(program, globals);
  registerNotifications(program, globals);
  registerSoundsBackup(program, globals);
  registerLifecycle(program, globals);
  return program;
}
