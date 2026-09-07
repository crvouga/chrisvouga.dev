import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { resolveFocusTarget } from '../../opencode/focus-request';
import { terminalTitleFor, titleSequence } from '../../opencode/session-token';
import type { Platform } from './platform/types';

export type FocusInput = {
  kind?: string | undefined;
  session?: string | undefined;
  dir: string;
  title?: string | undefined;
  token?: string | undefined;
  dryRun?: boolean | undefined;
};

/**
 * Resolve the focus-opencode click handler to run: the home symlink when it
 * points at a real file, else the checked-in repo source. Pure over explicit
 * args so manual-test commands stay unit-testable.
 */
export function resolveFocusScript(input: {
  homeScript: string;
  repoScript: string;
  exists?: (path: string) => boolean;
}): string | undefined {
  const exists = input.exists ?? existsSync;
  if (exists(input.homeScript)) return input.homeScript;
  if (exists(input.repoScript)) return input.repoScript;
  return undefined;
}

export function focusScriptPaths(
  platform: Platform,
  workstationRoot: string
): { homeScript: string; repoScript: string } {
  return {
    homeScript: join(platform.opencodeDir(), 'bin/focus-opencode'),
    repoScript: join(workstationRoot, 'opencode/bin/focus-opencode'),
  };
}

/** argv (after the script path) for a focus run. */
export function buildFocusArgs(input: FocusInput): string[] {
  const args = [
    '--kind',
    input.kind ?? 'finished',
    '--session',
    input.session ?? '',
    '--dir',
    input.dir,
    '--title',
    input.title ?? '',
    '--token',
    input.token ?? '',
  ];
  if (input.dryRun === true) args.push('--dry-run');
  return args;
}

/** Effective tab-match target for a focus run (token > title > opencode). */
export function focusTargetFor(input: FocusInput): string {
  return resolveFocusTarget({ token: input.token, title: input.title });
}

export type FocusRunResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  script: string;
};

/** Execute the click handler (or its `--dry-run` plan). Never throws. */
export function runFocusScript(
  script: string,
  input: FocusInput
): FocusRunResult {
  try {
    const result = spawnSync('bash', [script, ...buildFocusArgs(input)], {
      encoding: 'utf8',
    });
    return {
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      script,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, stdout: '', stderr: message, script };
  }
}

export type TagTerminalResult = { ok: boolean; detail: string };

export type TagTerminalIo = {
  open: (path: string, mode: string) => number;
  write: (fd: number, data: string) => void;
  close: (fd: number) => void;
};

const defaultTagIo: TagTerminalIo = {
  open: (path, mode) => openSync(path, mode) as number,
  write: (fd, data) => {
    writeSync(fd, data);
  },
  close: (fd) => {
    closeSync(fd);
  },
};

/**
 * Tag the calling terminal's title (OSC 0), exactly like the notification
 * plugin does — `ws notifications tag` runs this in the user's terminal so
 * the token mechanism is manually verifiable.
 */
export function tagTerminalTitle(
  sessionID: string | undefined,
  sessionTitle: string | undefined,
  io?: TagTerminalIo | undefined
): TagTerminalResult {
  const title = terminalTitleFor(sessionID, sessionTitle);
  if (title.length === 0) {
    return { ok: false, detail: 'no usable session id — nothing to tag' };
  }
  const sequence = titleSequence(title);
  try {
    const { open, write, close } = io ?? defaultTagIo;
    const fd = open('/dev/tty', 'w');
    try {
      write(fd, sequence);
    } finally {
      close(fd);
    }
    return { ok: true, detail: 'terminal title tagged' };
  } catch {
    return {
      ok: false,
      detail: 'no controlling terminal (/dev/tty unavailable)',
    };
  }
}
