#!/usr/bin/env bun
/**
 * `ws` — the workstation CLI. One stop shop for local machine config.
 *
 * - No args → interactive dashboard (searchable menu).
 * - Subcommands → scriptable + LLM-friendly (`--json`, `--yes`,
 *   `--non-interactive`, stable exit codes, secrets never printed).
 */
import { runInteractive } from './interactive';
import { buildProgram } from './program';
import { isExitPromptError } from './lib/cli-opts';
import { NonInteractiveError } from './lib/prompt';
import { fail, goodbye, printJson } from './lib/output-and-theme';

export async function main(): Promise<void> {
  // No subcommand → interactive dashboard (the primary entry point).
  if (process.argv.length <= 2) {
    await runInteractive();
    return;
  }
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (isExitPromptError(err)) {
      console.log('');
      goodbye();
      process.exit(0);
    }
    if (err instanceof NonInteractiveError) {
      reportNonInteractive(err);
      process.exit(2);
    }
    throw err;
  }
}

function reportNonInteractive(err: NonInteractiveError): void {
  if (process.argv.includes('--json')) {
    printJson({ ok: false, error: err.message });
    return;
  }
  fail(err.message);
}

const entry = process.argv[1] ?? '';
const isDirectRun =
  entry.endsWith('cli/index.ts') || entry.endsWith('cli\\index.ts');

if (isDirectRun) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (process.argv.includes('--json')) printJson({ ok: false, error: msg });
    else fail(msg);
    process.exit(1);
  });
}
