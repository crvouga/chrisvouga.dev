import type { GlobalOpts } from '../lib/cli-opts';
import { providerStatuses } from '../lib/providers-sync';
import {
  muted,
  ok,
  printJson,
  resolveOutputMode,
  section,
  startSpinner,
  warn as warnColor,
} from '../lib/output-and-theme';

export async function cmdProvidersList(opts: GlobalOpts): Promise<void> {
  const mode = resolveOutputMode(opts.json);
  const spinner = startSpinner('Reading Vault…', mode);
  const statuses = await providerStatuses();
  spinner?.stop();
  if (mode === 'json') {
    printJson({ ok: true, providers: statuses });
    return;
  }
  section(
    'Providers',
    'Vault-backed OpenCode connections (values never shown)'
  );
  for (const p of statuses) {
    const mark =
      p.state === 'connected'
        ? ok('✓')
        : p.state === 'missing'
          ? muted('−')
          : warnColor('!');
    console.log(
      `  ${mark} ${p.id} ${muted(`[${p.state}]`)} ${muted(p.vaultKey)}`
    );
    if (p.state === 'invalid' || p.state === 'unavailable') {
      console.log(`      ${muted(p.detail)}`);
    }
  }
}
