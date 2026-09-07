import { existsSync } from 'node:fs';

import { VaultCli } from '@pkgs/vault';

import { describeLink, managedLinks } from './links';
import { configPath, listProviders } from './opencode-config';
import { loadConfig } from './opencode-config';
import type { Platform } from './platform/types';
import { resolveVaultConfig } from './vault-config';
import { globalLauncherPath, isOnPath } from './global-install';

export type CheckSeverity = 'pass' | 'warn' | 'fail';

export type DoctorCheck = {
  id: string;
  label: string;
  severity: CheckSeverity;
  detail: string;
  fix?: string | undefined;
};

function launcherCheck(platform: Platform): DoctorCheck {
  const launcher = globalLauncherPath(platform);
  if (!existsSync(launcher)) {
    return {
      id: 'ws-launcher',
      label: 'ws launcher installed',
      severity: 'fail',
      detail: `missing ${launcher}`,
      fix: 'Run `ws install`.',
    };
  }
  const onPath = isOnPath(platform.globalBinDir());
  return {
    id: 'ws-launcher',
    label: 'ws launcher installed',
    severity: onPath ? 'pass' : 'warn',
    detail: onPath ? launcher : `${launcher} (not on PATH)`,
    ...(onPath
      ? {}
      : {
          fix: `Add ${platform.globalBinDir()} to PATH, then re-run \`ws doctor\`.`,
        }),
  };
}

function linkCheck(
  label: string,
  link: string,
  current: string | null
): DoctorCheck {
  if (current === null) {
    return {
      id: `link:${label}`,
      label,
      severity: 'fail',
      detail: `missing ${link}`,
      fix: 'Run `ws sync`.',
    };
  }
  return {
    id: `link:${label}`,
    label,
    severity: 'pass',
    detail: link,
  };
}

function linksChecks(
  platform: Platform,
  workstationRoot: string
): DoctorCheck[] {
  return managedLinks(workstationRoot, platform).map((link) => {
    const status = describeLink(link);
    if (status.state === 'ok' || status.state === 'missing') {
      return linkCheck(
        link.label,
        link.link,
        status.state === 'ok' ? link.link : null
      );
    }
    const detail =
      status.state === 'conflict-not-symlink'
        ? `${link.link} is not a symlink`
        : `${link.link} points at ${status.current}`;
    return {
      id: `link:${link.label}`,
      label: link.label,
      severity: 'fail' as const,
      detail,
      fix: `Move or remove ${link.link}, then run \`ws sync\`.`,
    };
  });
}

function notifierChecks(platform: Platform): DoctorCheck[] {
  if (platform.name !== 'darwin') {
    const caps = platform.notifierCapabilities();
    return [
      {
        id: 'notifier-app',
        label: 'Native notifier',
        severity: 'warn' as const,
        detail: caps.reason ?? 'macOS notifier unavailable',
      },
    ];
  }
  const app = `${platform.opencodeDir()}/bin/OpenCodeNotifier.app`;
  const built = existsSync(app);
  const sounds = `${platform.opencodeDir()}/notifier-sounds.json`;
  const soundsWritten = existsSync(sounds);
  return [
    {
      id: 'notifier-app',
      label: 'OpenCodeNotifier app',
      severity: built ? ('pass' as const) : ('warn' as const),
      detail: built
        ? app
        : 'not built — notifications use the osascript fallback',
      ...(built ? {} : { fix: 'Run `ws sync` (requires swiftc).' }),
    },
    {
      id: 'notifier-sounds',
      label: 'Notifier sounds config',
      severity: soundsWritten ? ('pass' as const) : ('fail' as const),
      detail: sounds,
      ...(soundsWritten ? {} : { fix: 'Run `ws sync`.' }),
    },
  ];
}

function configCheck(platform: Platform): DoctorCheck {
  const cfgPath = configPath(platform);
  if (!existsSync(cfgPath)) {
    return {
      id: 'opencode-config',
      label: 'opencode.json',
      severity: 'warn',
      detail: `missing ${cfgPath}`,
      fix: 'Run `ws opencode sync`.',
    };
  }
  try {
    const providers = listProviders(loadConfig(platform));
    return {
      id: 'opencode-config',
      label: 'opencode.json',
      severity: providers.length > 0 ? 'pass' : 'warn',
      detail: `${cfgPath} (${providers.length} provider(s): ${providers.join(', ') || 'none'})`,
      ...(providers.length > 0 ? {} : { fix: 'Run `ws opencode sync`.' }),
    };
  } catch (err) {
    return {
      id: 'opencode-config',
      label: 'opencode.json',
      severity: 'fail',
      detail: err instanceof Error ? err.message : String(err),
      fix: `Move or fix ${cfgPath}, then run \`ws opencode sync\`.`,
    };
  }
}

function vaultCheck(): DoctorCheck {
  const vault = resolveVaultConfig();
  try {
    const source = new VaultCli({ addr: vault.addr }).resolveToken().source;
    return {
      id: 'vault',
      label: 'Vault token',
      severity: 'pass',
      detail: `resolvable via ${source} (${vault.addr})`,
    };
  } catch (err) {
    return {
      id: 'vault',
      label: 'Vault token',
      severity: 'warn',
      detail: err instanceof Error ? err.message : String(err),
      fix: 'Run `vault login -method=userpass username=crvouga` or export VAULT_TOKEN.',
    };
  }
}

export function doctorChecks(
  platform: Platform,
  workstationRoot: string
): DoctorCheck[] {
  return [
    launcherCheck(platform),
    ...linksChecks(platform, workstationRoot),
    ...notifierChecks(platform),
    configCheck(platform),
    vaultCheck(),
  ];
}

export function doctorSummary(checks: readonly DoctorCheck[]): {
  pass: number;
  warn: number;
  fail: number;
} {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const c of checks) {
    if (c.severity === 'pass') pass += 1;
    else if (c.severity === 'warn') warn += 1;
    else fail += 1;
  }
  return { pass, warn, fail };
}
