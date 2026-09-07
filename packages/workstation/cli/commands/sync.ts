import { buildNotifier, writeSoundConfig } from '../lib/notifier-build';
import { ensureLink, managedLinks } from '../lib/links';
import type { Platform } from '../lib/platform/types';
import { workstationRoot } from '../lib/paths';
import { syncProvidersFromVault } from '../lib/providers-sync';
import { ensureTuiPlugin } from '../lib/tui-config';

export type SyncResult = {
  links: Array<{ label: string; link: string; status: string }>;
  sounds: string;
  notifier: { result: string; detail: string };
  tui: { path: string; status: string };
  providers: {
    connected: Array<{ id: string; vaultKey: string }>;
    skipped: Array<{ id: string; reason: string }>;
    configPath: string;
  };
};

/** Converge home directory to the checked-in spec. Throws on conflicts. */
export async function converge(
  platform: Platform,
  opts?: { strictProviders?: boolean | undefined }
): Promise<SyncResult> {
  const root = workstationRoot();

  const links = managedLinks(root, platform).map((managed) => {
    const status = ensureLink(managed);
    return { label: managed.label, link: managed.link, status };
  });

  const sounds = writeSoundConfig(platform);
  const notifier = buildNotifier(root, platform);
  const tui = ensureTuiPlugin(platform, root);

  const providers = await syncProvidersFromVault(platform, {
    strict: opts?.strictProviders ?? false,
  });

  return {
    links,
    sounds,
    notifier: { result: notifier.result, detail: notifier.detail },
    tui: { path: tui.path, status: tui.status },
    providers: {
      connected: providers.connected,
      skipped: providers.skipped,
      configPath: providers.configPath,
    },
  };
}
