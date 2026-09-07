import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { Plugin, PluginInput } from '@opencode-ai/plugin';

/**
 * Tool id of the built-in `question` tool. The agent invokes it when it needs
 * user input; OpenCode resolves this tool before executing it (permission
 * `question`, when configured).
 */
const QUESTION_TOOL = 'question';

/** Attention kinds and their exact notification copy. */
const MESSAGES = {
  finished: 'Session finished',
  question: 'Agent has a question',
  permission: 'Permission required',
  error: 'Session error',
} as const;

type Kind = keyof typeof MESSAGES;

/**
 * Distinct macOS system sound per attention kind, kept in sync with the
 * OpenCodeNotifier Swift source (packages/workstation/opencode/notifier/).
 *   finished   -> Hero     bright, rewarding "task complete" chime
 *   question   -> Ping     clean, attention-getting alert (agent needs input)
 *   permission -> Ping     same alert for a permission ask
 *   error      -> Sosumi   unmistakable "something went wrong" cue
 */
const SOUNDS: Record<Kind, string> = {
  finished: 'Hero',
  question: 'Ping',
  permission: 'Ping',
  error: 'Sosumi',
};

/** OpenCodeNotifier CLI linked into place by `bun run workstation:setup`. */
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
 * Post a click-to-focus notification (OpenCodeNotifier) carrying enough
 * context for the click handler to focus the right VS Code window, the
 * opencode terminal editor tab, and the attention session. Falls back to a
 * plain osascript notification when the notifier is unavailable. Never
 * throws — notification problems must never fail an OpenCode session.
 */
function post(
  kind: Kind,
  payload: { sessionID?: string; directory: string; sessionTitle?: string }
): void {
  const message = MESSAGES[kind];
  const sound = SOUNDS[kind];
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

export const NotificationsPlugin: Plugin = async ({ client, directory }) => {
  return {
    async event({ event }) {
      if (event.type === 'session.idle') {
        const sessionTitle = await fetchSessionTitle(
          client,
          event.properties.sessionID
        );
        post('finished', {
          sessionID: event.properties.sessionID,
          directory,
          sessionTitle,
        });
        return;
      }
      if (event.type === 'session.error') {
        const sessionID = event.properties.sessionID;
        const sessionTitle = await fetchSessionTitle(client, sessionID);
        post('error', { sessionID, directory, sessionTitle });
        return;
      }
      if ((event.type as string) !== 'permission.asked') return;

      const asked = event as unknown as PermissionAskedEvent;
      // The `question` tool can surface as a `question` permission ask. Its
      // own notification fires from the tool.execute.before hook instead, so
      // a single question produces exactly one notification.
      if (asked.properties.permission === QUESTION_TOOL) return;
      const sessionTitle = await fetchSessionTitle(
        client,
        asked.properties.sessionID
      );
      post('permission', {
        sessionID: asked.properties.sessionID,
        directory,
        sessionTitle,
      });
    },
    async 'tool.execute.before'({ tool, sessionID }) {
      if (tool !== QUESTION_TOOL) return;
      const sessionTitle = await fetchSessionTitle(client, sessionID);
      post('question', { sessionID, directory, sessionTitle });
    },
  };
};
