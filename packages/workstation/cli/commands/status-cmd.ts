import { currentPlatform } from '../lib/platform/index';
import { gatherStatus } from './status';
import type { GlobalOpts } from '../lib/cli-opts';
import {
  muted,
  ok,
  printJson,
  resolveOutputMode,
  section,
  startSpinner,
  warn as warnColor,
} from '../lib/output-and-theme';

function mark(state: string): string {
  if (state === 'ok') return ok('✓');
  if (state === 'missing') return warnColor('!');
  return '\x1b[31m✗\x1b[0m';
}

export async function cmdStatus(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const spinner = startSpinner('Gathering status…', mode);
  const status = await gatherStatus(platform);
  spinner?.stop();
  if (mode === 'json') {
    printJson({ ok: true, ...status });
    return;
  }
  section('Status', `ws ${status.version} · ${status.platform}`);
  printLauncher(
    status.launcher.installed,
    status.launcher.path,
    status.launcher.onPath
  );
  for (const link of status.links) {
    console.log(`  ${mark(link.state)} ${link.label} ${muted(link.state)}`);
  }
  printNotifier(
    status.notifier.app,
    status.notifier.appBuilt,
    status.notifier.daemonRunning,
    status.notifier.capabilities.reason
  );
  console.log(
    `  ${status.opencode.exists ? ok('✓') : warnColor('!')} opencode.json ${muted(`${status.opencode.providers.length} provider(s)`)}${status.opencode.model ? ` · model ${status.opencode.model}` : ''}`
  );
  printModelSlots(status.opencode.buildModel, status.opencode.planModel);
  console.log(
    `  ${status.tui.focusPluginRegistered ? ok('✓') : warnColor('!')} focus-session plugin ${muted(status.tui.configPath)}`
  );
  console.log(
    `  ${status.vault.reachable ? ok('✓') : warnColor('!')} vault ${muted(status.vault.path)}`
  );
}

function printModelSlots(build: string | null, plan: string | null): void {
  if (build === null && plan === null) return;
  console.log(
    `  ${muted('build:')} ${build ?? muted('unset')} ${muted('plan:')} ${plan ?? muted('unset')}`
  );
}

function printLauncher(
  installed: boolean,
  path: string,
  onPath: boolean
): void {
  const suffix = onPath ? '' : muted(' (not on PATH)');
  console.log(
    `  ${installed ? ok('✓') : warnColor('!')} launcher ${path}${suffix}`
  );
}

function printNotifier(
  app: string | null,
  built: boolean,
  daemon: boolean,
  reason: string | undefined
): void {
  if (app !== null) {
    const state = daemon ? muted('(daemon running)') : muted('(daemon idle)');
    console.log(`  ${built ? ok('✓') : warnColor('!')} notifier ${state}`);
    return;
  }
  console.log(`  ${warnColor('!')} notifier ${muted(reason ?? 'macOS-only')}`);
}
