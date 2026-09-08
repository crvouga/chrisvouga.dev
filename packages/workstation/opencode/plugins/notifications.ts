import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import {
  shortSessionToken,
  terminalTitleFor,
  titleSequence,
} from '../session-token';
import { NOTIFIER_SOUNDS } from '../../notifier/sounds';

/**
 * Tool id of the built-in `question` tool. The agent invokes it when it needs
 * user input; OpenCode resolves this tool before executing it (permission
 * `question`, when configured).
 */
const QUESTION_TOOL = 'question';

type Kind = keyof typeof NOTIFIER_SOUNDS;

/** Attention kinds and their exact notification copy. */
const MESSAGES: Record<Kind, string> = {
  finished: 'Session finished',
  interrupted: 'Session interrupted',
  question: 'Agent has a question',
  permission: 'Permission required',
  error: 'Session error',
};

/**
 * An interrupt (Esc / `session.interrupt` / abort) surfaces as the same
 * `session.idle` as a clean finish, so idle alone cannot tell "done" from
 * "stopped by the user". The abort signals below arrive around the idle —
 * sometimes just before, sometimes just after — and mark the session so the
 * idle resolves to `interrupted` instead of `finished`:
 *
 * - `session.error` with a `MessageAbortedError`
 * - `message.updated` for an assistant message carrying a
 *   `MessageAbortedError`
 * - `tui.command.execute` with `session.interrupt` (carries no session id,
 *   so it acts as a global "an interrupt just happened" hint)
 */
const FINISHED_DELAY_MS = 800;
const INTERRUPT_WINDOW_MS = 5000;
const ERROR_WINDOW_MS = 3000;

/** True for `MessageAbortedError` (or an abort-flavoured message). */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const named = error as { name?: unknown; data?: unknown };
  if (named.name === 'MessageAbortedError') return true;
  const data = named.data as { message?: unknown } | undefined;
  return typeof data?.message === 'string' && /abort/i.test(data.message);
}

/** True for the TUI interrupt command (Esc). */
export function isInterruptCommand(command: string): boolean {
  return command === 'session.interrupt';
}

/**
 * Runtime sound config written by `ws sync` from the central
 * `sounds.ts`. Read per notification so sound changes take effect without
 * restarting opencode. Falls back to the central defaults when missing.
 */
const SOUNDS_CONFIG = join(homedir(), '.config/opencode/notifier-sounds.json');

function soundFor(kind: Kind): string {
  try {
    const parsed = JSON.parse(readFileSync(SOUNDS_CONFIG, 'utf8')) as Partial<
      Record<Kind, string>
    >;
    return parsed[kind] ?? NOTIFIER_SOUNDS[kind];
  } catch {
    return NOTIFIER_SOUNDS[kind];
  }
}

/** OpenCodeNotifier CLI linked into place by `ws sync`. */
const NOTIFIER_CLI = join(homedir(), '.config/opencode/bin/opencode-notifier');

type OpencodeClient = PluginInput['client'];

/**
 * Build an AppleScript string literal for the given text.
 *
 * `display notification` receives title/message as AppleScript strings, so the
 * text is escaped here and passed as a single spawn argument — never via a
 * shell string.
 */
function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

/** Fallback: plain osascript notification (no click actions). Never throws. */
function notifyViaOsascript(
  title: string,
  message: string,
  sound: string
): void {
  try {
    const script = `display notification ${appleScriptString(message)} with title ${appleScriptString(title)} sound name ${appleScriptString(sound)}`;
    const child = spawn('osascript', ['-e', script], { stdio: 'ignore' });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // osascript missing, notification permission denied, etc. — ignore.
  }
}

/**
 * Best-effort session title lookup for the notification subtitle and the
 * terminal-tab type-ahead hint. Never throws, never blocks for long.
 */
async function fetchSessionTitle(
  client: OpencodeClient,
  sessionID: string | undefined
): Promise<string | undefined> {
  if (!sessionID) return undefined;
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), 500)
  );
  try {
    const result = await Promise.race([
      client.session.get({ path: { id: sessionID } }),
      timeout,
    ]);
    if (result === null) return undefined;
    return result.data?.title || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Tag the controlling terminal's title with the session token so the click
 * handler can match this exact session's VS Code tab. Best-effort: skipped
 * when there is no controlling terminal (headless/serve) or the write fails.
 * The opencode TUI never sets terminal titles, so the tag sticks until the
 * next notification re-tags it. Never throws.
 */
function tagTerminal(
  sessionID: string | undefined,
  sessionTitle: string | undefined
): void {
  try {
    const title = terminalTitleFor(sessionID, sessionTitle);
    if (!title) return;
    const fd = openSync('/dev/tty', 'w');
    try {
      writeSync(fd, titleSequence(title));
    } finally {
      closeSync(fd);
    }
  } catch {
    // No controlling terminal or write failed — focus falls back to title matching.
  }
}

/**
 * Post a click-to-focus notification (OpenCodeNotifier) carrying enough
 * context for the click handler to focus the right VS Code window, the
 * opencode terminal editor tab, and the attention session. Falls back to a
 * plain osascript notification when the notifier is unavailable. Never
 * throws — notification problems must never fail an OpenCode session.
 */
function post(
  kind: Kind,
  payload: {
    sessionID?: string | undefined;
    directory: string;
    sessionTitle?: string | undefined;
  }
): void {
  const message = MESSAGES[kind];
  const sound = soundFor(kind);
  tagTerminal(payload.sessionID, payload.sessionTitle);
  const token = shortSessionToken(payload.sessionID);
  try {
    if (existsSync(NOTIFIER_CLI)) {
      const body = JSON.stringify({
        kind,
        title: 'OpenCode',
        message,
        subtitle:
          payload.sessionTitle ?? basename(payload.directory) ?? 'opencode',
        sessionID: payload.sessionID ?? '',
        directory: payload.directory,
        sessionTitle: payload.sessionTitle ?? '',
        token,
      });
      const child = spawn(NOTIFIER_CLI, ['--post', body], { stdio: 'ignore' });
      // --post exits 0 only when the payload reached the daemon; anything
      // else (spawn failure, exit != 0) falls back to a plain notification.
      child.on('error', () => notifyViaOsascript('OpenCode', message, sound));
      child.on('exit', (code) => {
        if (code !== 0) notifyViaOsascript('OpenCode', message, sound);
      });
      child.unref();
      return;
    }
    notifyViaOsascript('OpenCode', message, sound);
  } catch {
    notifyViaOsascript('OpenCode', message, sound);
  }
}

/**
 * Runtime shape of the `permission.asked` event.
 *
 * The running OpenCode server publishes this event whenever a permission
 * genuinely needs a user reply (see https://opencode.ai/docs/plugins/). The
 * 1.18.29 SDK `Event` type mislabels it as `permission.updated`, so this
 * narrow local type stays accurate to the wire format without `any`.
 */
type PermissionAskedEvent = {
  type: 'permission.asked';
  properties: {
    id: string;
    sessionID: string;
    messageID: string;
    permission: string;
    patterns: string[];
    metadata: Record<string, unknown>;
    always: string[];
    tool?: { messageID: string; callID: string };
  };
};

/** Per-plugin interrupt/error markers shared by the event handlers. */
export type AttentionState = {
  interruptedAt: Map<string, number>;
  notifiedInterruptedAt: Map<string, number>;
  erroredAt: Map<string, number>;
  pendingFinished: Map<string, ReturnType<typeof setTimeout>>;
  lastInterruptCommandAt: number;
};

export function createAttentionState(): AttentionState {
  return {
    interruptedAt: new Map(),
    notifiedInterruptedAt: new Map(),
    erroredAt: new Map(),
    pendingFinished: new Map(),
    lastInterruptCommandAt: 0,
  };
}

type AttentionContext = {
  state: AttentionState;
  client: OpencodeClient;
  directory: string;
};

function wasRecently(
  map: Map<string, number>,
  sessionID: string | undefined,
  now: number,
  windowMs: number
): boolean {
  if (!sessionID) return false;
  const at = map.get(sessionID);
  return at !== undefined && now - at <= windowMs;
}

function cancelPendingFinished(
  state: AttentionState,
  sessionID: string | undefined
): void {
  if (!sessionID) return;
  const timer = state.pendingFinished.get(sessionID);
  if (timer !== undefined) {
    clearTimeout(timer);
    state.pendingFinished.delete(sessionID);
  }
}

function idleBelongsToInterrupt(
  state: AttentionState,
  sessionID: string | undefined,
  now: number
): boolean {
  return (
    wasRecently(state.interruptedAt, sessionID, now, INTERRUPT_WINDOW_MS) ||
    (state.lastInterruptCommandAt > 0 &&
      now - state.lastInterruptCommandAt <= INTERRUPT_WINDOW_MS)
  );
}

async function postInterrupted(
  ctx: AttentionContext,
  sessionID: string | undefined
): Promise<void> {
  const now = Date.now();
  if (
    wasRecently(
      ctx.state.notifiedInterruptedAt,
      sessionID,
      now,
      INTERRUPT_WINDOW_MS
    )
  )
    return;
  cancelPendingFinished(ctx.state, sessionID);
  if (sessionID) {
    ctx.state.interruptedAt.set(sessionID, now);
    ctx.state.notifiedInterruptedAt.set(sessionID, now);
  }
  const sessionTitle = await fetchSessionTitle(ctx.client, sessionID);
  post('interrupted', { sessionID, directory: ctx.directory, sessionTitle });
}

async function scheduleFinished(
  ctx: AttentionContext,
  sessionID: string | undefined
): Promise<void> {
  // Already know this idle belongs to an interrupt or an error: resolve it
  // now instead of posting a misleading `finished`.
  if (idleBelongsToInterrupt(ctx.state, sessionID, Date.now())) {
    await postInterrupted(ctx, sessionID);
    return;
  }
  if (wasRecently(ctx.state.erroredAt, sessionID, Date.now(), ERROR_WINDOW_MS))
    return;
  // Hold the finish briefly: an abort/error arriving just after the idle
  // cancels it so a failure never flashes as "finished" first.
  if (!sessionID) {
    const sessionTitle = await fetchSessionTitle(ctx.client, sessionID);
    post('finished', { sessionID, directory: ctx.directory, sessionTitle });
    return;
  }
  if (ctx.state.pendingFinished.has(sessionID)) return;
  const sessionTitle = await fetchSessionTitle(ctx.client, sessionID);
  if (
    idleBelongsToInterrupt(ctx.state, sessionID, Date.now()) ||
    wasRecently(ctx.state.erroredAt, sessionID, Date.now(), ERROR_WINDOW_MS)
  ) {
    if (idleBelongsToInterrupt(ctx.state, sessionID, Date.now())) {
      await postInterrupted(ctx, sessionID);
    }
    return;
  }
  const id = sessionID;
  const timer = setTimeout(() => {
    ctx.state.pendingFinished.delete(id);
    if (idleBelongsToInterrupt(ctx.state, id, Date.now())) {
      void postInterrupted(ctx, id);
      return;
    }
    if (wasRecently(ctx.state.erroredAt, id, Date.now(), ERROR_WINDOW_MS))
      return;
    post('finished', { sessionID: id, directory: ctx.directory, sessionTitle });
  }, FINISHED_DELAY_MS);
  ctx.state.pendingFinished.set(sessionID, timer);
}

async function handleSessionError(
  ctx: AttentionContext,
  sessionID: string | undefined,
  error: unknown
): Promise<void> {
  if (isAbortError(error)) {
    await postInterrupted(ctx, sessionID);
    return;
  }
  cancelPendingFinished(ctx.state, sessionID);
  if (sessionID) ctx.state.erroredAt.set(sessionID, Date.now());
  const sessionTitle = await fetchSessionTitle(ctx.client, sessionID);
  post('error', { sessionID, directory: ctx.directory, sessionTitle });
}

async function handlePermissionAsked(
  ctx: AttentionContext,
  event: { type: string }
): Promise<void> {
  if (event.type !== 'permission.asked') return;
  const asked = event as unknown as PermissionAskedEvent;
  // The `question` tool can surface as a `question` permission ask. Its
  // own notification fires from the tool.execute.before hook instead, so
  // a single question produces exactly one notification.
  if (asked.properties.permission === QUESTION_TOOL) return;
  const sessionTitle = await fetchSessionTitle(
    ctx.client,
    asked.properties.sessionID
  );
  post('permission', {
    sessionID: asked.properties.sessionID,
    directory: ctx.directory,
    sessionTitle,
  });
}

export const NotificationsPlugin: Plugin = async ({ client, directory }) => {
  const ctx: AttentionContext = {
    state: createAttentionState(),
    client,
    directory,
  };
  return {
    async event({ event }) {
      if (event.type === 'session.idle') {
        await scheduleFinished(ctx, event.properties.sessionID);
        return;
      }
      if (event.type === 'session.error') {
        await handleSessionError(
          ctx,
          event.properties.sessionID,
          event.properties.error
        );
        return;
      }
      if (event.type === 'message.updated') {
        const info = event.properties.info;
        if (
          info.role === 'assistant' &&
          'error' in info &&
          isAbortError(info.error)
        ) {
          await postInterrupted(ctx, info.sessionID);
        }
        return;
      }
      if (event.type === 'tui.command.execute') {
        if (isInterruptCommand(event.properties.command)) {
          ctx.state.lastInterruptCommandAt = Date.now();
        }
        return;
      }
      await handlePermissionAsked(ctx, event);
    },
    async 'tool.execute.before'({ tool, sessionID }) {
      if (tool !== QUESTION_TOOL) return;
      const sessionTitle = await fetchSessionTitle(client, sessionID);
      post('question', { sessionID, directory, sessionTitle });
    },
  };
};
