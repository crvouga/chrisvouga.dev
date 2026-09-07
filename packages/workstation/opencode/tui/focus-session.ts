/**
 * Focus-session TUI plugin — the session-switching half of click-to-focus.
 *
 * The notification click handler (`opencode/bin/focus-opencode`) focuses the
 * VS Code window + terminal tab from outside, then writes a focus request
 * (`~/.cache/opencode-focus-request.json`). Every opencode TUI running this
 * plugin polls that file; the TUI that owns the requested session navigates
 * to it via the official route API. Other TUIs ignore the request.
 *
 * Session switching is deliberately NOT done with keystrokes into the TUI:
 * typing a session id into a waiting prompt (permission/question) would
 * corrupt the user's input. `route.navigate` is safe in every TUI state.
 *
 * Registered in `~/.config/opencode/tui.json` by `ws sync` (see
 * `cli/lib/tui-config.ts`) — a single module cannot export both `server` and
 * `tui`, so this lives apart from the server-side `plugins/notifications.ts`.
 */

import type {
  TuiPlugin,
  TuiPluginModule,
  TuiRouteCurrent,
} from '@opencode-ai/plugin/tui';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  FOCUS_REQUEST_POLL_MS,
  focusRequestPath,
  readFocusRequest,
  shouldNavigateToSession,
} from '../focus-request';

const PLUGIN_ID = 'workstation.focus-session';

/** Session id the TUI is currently showing, if any. */
function currentSessionID(current: TuiRouteCurrent): string | undefined {
  if (current.name !== 'session') return undefined;
  const params = (current as { params?: { sessionID?: unknown } }).params;
  const sessionID = params?.sessionID;
  return typeof sessionID === 'string' ? sessionID : undefined;
}

const tui: TuiPlugin = async (api) => {
  let lastHandled = 0;
  const cacheDir = join(homedir(), '.cache');

  const poll = (): void => {
    try {
      const request = readFocusRequest(cacheDir);
      if (request === undefined) return;
      if (request.timestamp <= lastHandled) return;
      const sessionID = request.sessionID;
      const owned = api.state.session.get(sessionID) !== undefined;
      const showing = currentSessionID(api.route.current);
      const snapshot =
        showing === undefined
          ? { name: api.route.current.name }
          : { name: 'session' as const, sessionID: showing };
      if (!shouldNavigateToSession(snapshot, request, owned)) return;
      lastHandled = request.timestamp;
      api.route.navigate('session', { sessionID });
    } catch {
      // Best-effort: focus must never break the TUI.
    }
  };

  const timer = setInterval(poll, FOCUS_REQUEST_POLL_MS);
  api.lifecycle.onDispose(() => {
    clearInterval(timer);
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
};

export default plugin;

/** Absolute repo path of this plugin file (registered in tui.json). */
export function focusSessionPluginPath(workstationRoot: string): string {
  return join(workstationRoot, 'opencode/tui/focus-session.ts');
}

/** Path of the focus-request file (re-exported for CLI/tests). */
export function focusSessionRequestPath(): string {
  return focusRequestPath(join(homedir(), '.cache'));
}
