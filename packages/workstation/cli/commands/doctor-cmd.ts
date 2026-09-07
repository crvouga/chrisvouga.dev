import { converge } from './sync';
import { currentPlatform } from '../lib/platform/index';
import { workstationRoot } from '../lib/paths';
import type { GlobalOpts } from '../lib/cli-opts';
import { doctorChecks, doctorSummary, type DoctorCheck } from '../lib/doctor';
import {
  muted,
  ok,
  printJson,
  printOk,
  resolveOutputMode,
  section,
  warn as warnColor,
} from '../lib/output-and-theme';

type DoctorOpts = GlobalOpts & { fix?: boolean | undefined };

function mark(severity: DoctorCheck['severity']): string {
  if (severity === 'pass') return ok('✓');
  if (severity === 'warn') return warnColor('!');
  return '\x1b[31m✗\x1b[0m';
}

function printChecks(checks: readonly DoctorCheck[]): void {
  for (const c of checks) {
    console.log(`  ${mark(c.severity)} ${c.label}`);
    console.log(`      ${muted(c.detail)}`);
    if (c.fix !== undefined && c.severity !== 'pass') {
      console.log(`      ${muted(`fix: ${c.fix}`)}`);
    }
  }
}

export async function cmdDoctor(opts: DoctorOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  if (opts.fix === true) {
    await converge(platform);
    const after = doctorChecks(platform, workstationRoot());
    if (mode === 'json') {
      printJson({
        ok: true,
        fixed: true,
        checks: after,
        summary: doctorSummary(after),
      });
      return;
    }
    printOk('Auto-fix applied (ws sync). Re-check:');
    printChecks(after);
    if (doctorSummary(after).fail > 0) process.exit(1);
    return;
  }
  const checks = doctorChecks(platform, workstationRoot());
  const summary = doctorSummary(checks);
  if (mode === 'json') {
    printJson({ ok: summary.fail === 0, checks, summary });
    if (summary.fail > 0) process.exit(1);
    return;
  }
  section(
    'Doctor',
    `${summary.pass} pass · ${summary.warn} warn · ${summary.fail} fail`
  );
  printChecks(checks);
  if (summary.fail > 0) process.exit(1);
}
