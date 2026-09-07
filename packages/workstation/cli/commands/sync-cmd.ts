import { converge } from './sync';
import { currentPlatform } from '../lib/platform/index';
import type { GlobalOpts } from '../lib/cli-opts';
import {
  muted,
  ok,
  printJson,
  resolveOutputMode,
  startSpinner,
} from '../lib/output-and-theme';

type SyncOpts = GlobalOpts & { strict?: boolean | undefined };

export async function cmdSync(opts: SyncOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const spinner = startSpinner('Syncing workstation…', mode);
  try {
    const result = await converge(platform, { strictProviders: opts.strict });
    spinner?.succeed('Synced');
    if (mode === 'json') {
      printJson({ ok: true, ...result });
      return;
    }
    for (const link of result.links) {
      console.log(`  [${link.status}] ${link.link}`);
    }
    console.log(`  [written] ${result.sounds}`);
    console.log(`  [${result.tui.status}] tui plugins: ${result.tui.path}`);
    console.log(
      `  [${result.notifier.result}] notifier: ${result.notifier.detail}`
    );
    printProviders(
      result.providers.connected,
      result.providers.skipped,
      result.providers.configPath
    );
  } catch (err) {
    spinner?.fail('Sync failed');
    throw err;
  }
}

function printProviders(
  connected: Array<{ id: string; vaultKey: string }>,
  skipped: Array<{ id: string; reason: string }>,
  configPath: string
): void {
  const suffix =
    configPath.length > 0
      ? ` → ${configPath}`
      : ' (vault unavailable — skipped)';
  console.log(`  connected ${connected.length} provider(s)${suffix}`);
  for (const p of connected) {
    console.log(`    ${ok('✓')} ${p.id} (${p.vaultKey})`);
  }
  for (const s of skipped) {
    console.log(`    ${muted('−')} ${s.id}: ${s.reason.split('\n')[0]}`);
  }
}
