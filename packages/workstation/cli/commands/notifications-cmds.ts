import { existsSync, unlinkSync } from 'node:fs';

import {
  focusRequestPath,
  isFocusRequestFresh,
  readFocusRequest,
  writeFocusRequest,
} from '../../opencode/focus-request';
import { shortSessionToken } from '../../opencode/session-token';
import type { GlobalOpts } from '../lib/cli-opts';
import { confirmOrThrow } from '../lib/cli-opts';
import {
  buildFocusArgs,
  focusScriptPaths,
  focusTargetFor,
  resolveFocusScript,
  runFocusScript,
  tagTerminalTitle,
} from '../lib/focus';
import { describeLink, ensureLink, managedLinks } from '../lib/links';
import { writeSoundConfig } from '../lib/notifier-build';
import { currentPlatform } from '../lib/platform/index';
import type { NotificationKind } from '../lib/platform/types';
import { workstationRoot } from '../lib/paths';
import {
  muted,
  printFail,
  printJson,
  printOk,
  resolveOutputMode,
  section,
  type OutputMode,
} from '../lib/output-and-theme';

const KINDS: NotificationKind[] = [
  'finished',
  'question',
  'permission',
  'error',
];

function pluginLink(): { link: string; target: string; label: string } {
  const plugin = managedLinks(workstationRoot(), currentPlatform()).find((l) =>
    l.label.includes('notification plugin')
  );
  if (plugin === undefined) {
    throw new Error('Plugin link not defined for this platform.');
  }
  return plugin;
}

export async function cmdNotificationsStatus(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const plugin = pluginLink();
  const state = describeLink(plugin).state;
  const caps = platform.notifierCapabilities();
  const payload = {
    enabled: state === 'ok',
    pluginState: state,
    daemonRunning: platform.isNotifierDaemonRunning(),
    capabilities: caps,
    soundsPath: `${platform.opencodeDir()}/notifier-sounds.json`,
  };
  if (mode === 'json') {
    printJson({ ok: true, ...payload });
    return;
  }
  section('Notifications', payload.enabled ? 'enabled' : 'disabled');
  console.log(`  plugin: ${muted(state)}`);
  const daemon = payload.daemonRunning ? 'running' : 'idle';
  console.log(`  daemon: ${muted(daemon)}`);
  if (caps.reason !== undefined) console.log(`  ${muted(caps.reason)}`);
}

export async function cmdNotificationsEnable(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const plugin = pluginLink();
  const status = ensureLink(plugin);
  writeSoundConfig(platform);
  if (mode === 'json') {
    printJson({ ok: true, plugin: plugin.link, status });
    return;
  }
  printOk(`Notifications enabled [${status}] ${plugin.link}`);
}

export async function cmdNotificationsDisable(opts: GlobalOpts): Promise<void> {
  const mode = resolveOutputMode(opts.json);
  const plugin = pluginLink();
  await confirmOrThrow(
    'Disable notifications?',
    `Removes the symlink ${plugin.link}. Re-enable with \`ws notifications enable\`.`,
    opts
  );
  if (existsSync(plugin.link)) unlinkSync(plugin.link);
  if (mode === 'json') {
    printJson({ ok: true, disabled: true, plugin: plugin.link });
    return;
  }
  printOk(`Notifications disabled (removed ${plugin.link})`);
}

export async function cmdNotificationsTest(
  kind: string,
  opts: GlobalOpts
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const resolved: NotificationKind = KINDS.includes(kind as NotificationKind)
    ? (kind as NotificationKind)
    : 'finished';
  const result = await platform.postNotification({
    title: 'ws test',
    message: `Test notification (${resolved})`,
    kind: resolved,
  });
  if (mode === 'json') {
    printJson({ ...result });
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    printOk(result.detail);
    return;
  }
  printFail(result.detail);
  process.exit(1);
}

export type FocusCmdOpts = GlobalOpts & {
  dir?: string | undefined;
  session?: string | undefined;
  title?: string | undefined;
  token?: string | undefined;
  kind?: string | undefined;
  dryRun?: boolean | undefined;
};

function failWith(mode: OutputMode, error: string): never {
  if (mode === 'json') printJson({ ok: false, error });
  else printFail(error);
  process.exit(1);
}

function resolveFocusDir(opts: FocusCmdOpts, mode: OutputMode): string {
  if (opts.dir !== undefined && opts.dir.length > 0) return opts.dir;
  return failWith(mode, 'Missing --dir <project-dir>.');
}

function resolveFocusHandler(
  homeScript: string,
  repoScript: string,
  mode: OutputMode
): string {
  const script = resolveFocusScript({ homeScript, repoScript });
  if (script !== undefined) return script;
  return failWith(
    mode,
    `focus-opencode not found (looked at ${homeScript} and ${repoScript}). Run \`ws sync\`.`
  );
}

function emitFocusResult(
  script: string,
  input: {
    kind: string;
    session: string;
    dir: string;
    title: string;
    token: string;
    dryRun: boolean;
  },
  result: {
    ok: boolean;
    status: number | null;
    stdout: string;
    stderr: string;
  },
  mode: OutputMode
): void {
  if (mode === 'json') {
    printJson({
      ok: result.ok,
      script,
      args: buildFocusArgs(input),
      target: focusTargetFor(input),
      stdout: result.stdout,
      stderr: result.stderr,
    });
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.stdout.length > 0) console.log(result.stdout.trimEnd());
  if (result.stderr.length > 0) console.log(result.stderr.trimEnd());
  if (result.ok) {
    printOk(input.dryRun ? 'focus plan printed' : 'focus handler ran [exit 0]');
    return;
  }
  printFail(`focus handler exited ${result.status ?? 'unknown'}`);
  process.exit(1);
}

/**
 * Manual test for the banner-click path: runs the same `focus-opencode`
 * handler the daemon execs, against a real dir/session. `--dry-run` prints
 * the window/tab/session plan without touching anything.
 */
export async function cmdNotificationsFocus(opts: FocusCmdOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const dir = resolveFocusDir(opts, mode);
  const paths = focusScriptPaths(platform, workstationRoot());
  const script = resolveFocusHandler(paths.homeScript, paths.repoScript, mode);
  const input = {
    kind: opts.kind ?? 'finished',
    session: opts.session ?? '',
    dir,
    title: opts.title ?? '',
    token: opts.token ?? shortSessionToken(opts.session),
    dryRun: opts.dryRun ?? false,
  };
  const result = runFocusScript(script, input);
  emitFocusResult(script, input, result, mode);
}

export type FocusRequestCmdOpts = GlobalOpts & {
  session?: string | undefined;
  read?: boolean | undefined;
};

function reportFocusRequest(cacheDir: string, mode: OutputMode): void {
  const request = readFocusRequest(cacheDir);
  if (mode === 'json') {
    printJson({
      ok: true,
      path: focusRequestPath(cacheDir),
      request,
      fresh: request === undefined ? false : isFocusRequestFresh(request),
    });
    return;
  }
  if (request === undefined) {
    console.log(`  no focus request at ${focusRequestPath(cacheDir)}`);
    return;
  }
  const fresh = isFocusRequestFresh(request) ? 'fresh' : 'stale';
  console.log(`  session ${request.sessionID} (${fresh})`);
}

function writeAndReportFocusRequest(
  cacheDir: string,
  session: string,
  mode: OutputMode
): void {
  const request = writeFocusRequest(cacheDir, session);
  if (mode === 'json') {
    printJson({ ok: true, path: focusRequestPath(cacheDir), request });
    return;
  }
  printOk(`focus request written for ${request.sessionID}`);
}

/**
 * Manual test for the session-switch half: `--session <id>` writes the same
 * focus request a banner click writes (watch the owning TUI navigate there);
 * `--read` inspects the current request and its freshness.
 */
export async function cmdFocusRequest(
  opts: FocusRequestCmdOpts
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const cacheDir = platform.cacheDir();
  if (opts.read === true) {
    reportFocusRequest(cacheDir, mode);
    return;
  }
  if (opts.session === undefined || opts.session.length === 0) {
    failWith(mode, 'Missing --session <id> (or pass --read to inspect).');
  }
  writeAndReportFocusRequest(cacheDir, opts.session, mode);
}

export type TagCmdOpts = GlobalOpts & {
  session?: string | undefined;
  title?: string | undefined;
};

/**
 * Manual test for terminal tagging: tags this terminal's title with the
 * session token, exactly like the notification plugin does. Run inside a
 * VS Code terminal and watch the tab title change.
 */
export async function cmdNotificationsTag(opts: TagCmdOpts): Promise<void> {
  const mode = resolveOutputMode(opts.json);
  const result = tagTerminalTitle(opts.session, opts.title);
  if (mode === 'json') {
    printJson({
      ok: result.ok,
      detail: result.detail,
      token: shortSessionToken(opts.session),
    });
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    printOk(`${result.detail} [${shortSessionToken(opts.session)}]`);
    return;
  }
  printFail(result.detail);
  process.exit(1);
}
