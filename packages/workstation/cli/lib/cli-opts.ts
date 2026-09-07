import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workstationRoot } from './paths';
import { cancelled } from './output-and-theme';
import { askConfirm, NonInteractiveError } from './prompt';

export type GlobalOpts = {
  json?: boolean | undefined;
  yes?: boolean | undefined;
  nonInteractive?: boolean | undefined;
};

export function readVersion(): string {
  try {
    const raw = readFileSync(join(workstationRoot(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function isExitPromptError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'name' in err &&
    (err as { name: string }).name === 'ExitPromptError'
  );
}

export async function confirmOrThrow(
  question: string,
  detail: string,
  opts: GlobalOpts
): Promise<void> {
  if (opts.yes === true) return;
  if (opts.nonInteractive === true) throw new NonInteractiveError();
  const confirmed = await askConfirm(question, detail, false);
  if (!confirmed) {
    cancelled();
    process.exit(1);
  }
}
