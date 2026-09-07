import ora, { type Ora } from 'ora';

import { err, muted, ok, warn } from './theme';

export type OutputMode = 'human' | 'json';

export function resolveOutputMode(json: boolean | undefined): OutputMode {
  return json === true ? 'json' : 'human';
}

/** Print a machine-readable payload (LLM-friendly). Secrets are never included. */
export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

export function printOk(message: string): void {
  console.log(`${ok('✓')} ${message}`);
}

export function printWarn(message: string): void {
  console.log(`${warn('!')} ${message}`);
}

export function printFail(message: string): void {
  console.error(`${err('✗')} ${message}`);
}

export function printMuted(message: string): void {
  console.log(muted(message));
}

/** No-op spinner in JSON mode (keeps stdout parseable); ora otherwise. */
export function startSpinner(text: string, mode: OutputMode): Ora | null {
  if (mode === 'json') return null;
  return ora({ text }).start();
}
