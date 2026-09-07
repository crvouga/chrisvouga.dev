import { existsSync } from 'node:fs';

import { VaultCli } from '@pkgs/vault';

import { globalLauncherPath, isOnPath } from '../lib/global-install';
import { describeLink, managedLinks } from '../lib/links';
import {
  configPath,
  getModel,
  getModelSlot,
  getSmallModel,
  listProviders,
  loadConfig,
} from '../lib/opencode-config';
import type { Platform } from '../lib/platform/types';
import { isTuiPluginRegistered, tuiConfigPath } from '../lib/tui-config';
import { workstationRoot, workstationVersion } from '../lib/paths';
import { resolveVaultConfig } from '../lib/vault-config';

export type WsStatus = {
  version: string;
  platform: string;
  launcher: { path: string; installed: boolean; onPath: boolean };
  links: Array<{
    label: string;
    link: string;
    target: string;
    state: string;
  }>;
  notifier: {
    app: string | null;
    appBuilt: boolean;
    daemonRunning: boolean;
    sounds: string;
    soundsWritten: boolean;
    capabilities: ReturnType<Platform['notifierCapabilities']>;
  };
  opencode: {
    configPath: string;
    exists: boolean;
    providers: string[];
    model: string | null;
    smallModel: string | null;
    buildModel: string | null;
    planModel: string | null;
  };
  tui: {
    configPath: string;
    focusPluginRegistered: boolean;
  };
  vault: {
    addr: string;
    path: string;
    reachable: boolean;
    source: string | null;
  };
};

function gatherLauncher(platform: Platform): WsStatus['launcher'] {
  const path = globalLauncherPath(platform);
  return {
    path,
    installed: existsSync(path),
    onPath: isOnPath(platform.globalBinDir()),
  };
}

function gatherLinks(platform: Platform): WsStatus['links'] {
  return managedLinks(workstationRoot(), platform).map((link) => ({
    label: link.label,
    link: link.link,
    target: link.target,
    state: describeLink(link).state,
  }));
}

function gatherNotifier(platform: Platform): WsStatus['notifier'] {
  const app =
    platform.name === 'darwin'
      ? `${platform.opencodeDir()}/bin/OpenCodeNotifier.app`
      : null;
  const sounds = `${platform.opencodeDir()}/notifier-sounds.json`;
  return {
    app,
    appBuilt: app !== null ? existsSync(app) : false,
    daemonRunning: platform.isNotifierDaemonRunning(),
    sounds,
    soundsWritten: existsSync(sounds),
    capabilities: platform.notifierCapabilities(),
  };
}

function gatherOpencode(platform: Platform): WsStatus['opencode'] {
  const path = configPath(platform);
  const exists = existsSync(path);
  if (!exists) {
    return {
      configPath: path,
      exists: false,
      providers: [],
      model: null,
      smallModel: null,
      buildModel: null,
      planModel: null,
    };
  }
  try {
    const cfg = loadConfig(platform);
    return {
      configPath: path,
      exists: true,
      providers: listProviders(cfg),
      model: getModel(cfg),
      smallModel: getSmallModel(cfg),
      buildModel: getModelSlot(cfg, 'build_model'),
      planModel: getModelSlot(cfg, 'plan_model'),
    };
  } catch {
    return {
      configPath: path,
      exists: true,
      providers: [],
      model: null,
      smallModel: null,
      buildModel: null,
      planModel: null,
    };
  }
}

function gatherVault(): WsStatus['vault'] {
  const vault = resolveVaultConfig();
  try {
    const source = new VaultCli({ addr: vault.addr }).resolveToken().source;
    return {
      addr: vault.addr,
      path: `${vault.mount}/data/${vault.project}/${vault.config}`,
      reachable: true,
      source,
    };
  } catch {
    return {
      addr: vault.addr,
      path: `${vault.mount}/data/${vault.project}/${vault.config}`,
      reachable: false,
      source: null,
    };
  }
}

export async function gatherStatus(platform: Platform): Promise<WsStatus> {
  return {
    version: await workstationVersion(),
    platform: platform.label,
    launcher: gatherLauncher(platform),
    links: gatherLinks(platform),
    notifier: gatherNotifier(platform),
    opencode: gatherOpencode(platform),
    tui: {
      configPath: tuiConfigPath(platform),
      focusPluginRegistered: isTuiPluginRegistered(platform, workstationRoot()),
    },
    vault: gatherVault(),
  };
}
