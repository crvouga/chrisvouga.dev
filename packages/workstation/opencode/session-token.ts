/**
 * Per-session terminal tag for deterministic click-to-focus.
 *
 * Each OpenCode session gets a short token (trailing characters of the
 * session id). The notification plugin writes the token into its controlling
 * terminal's title at notification time, and the click handler matches the
 * VS Code terminal tab by that exact token — so a banner click always lands
 * on the tab running the session the notification belongs to.
 */

const TOKEN_LENGTH = 7;
const TITLE_MAX_LENGTH = 60;

/** Short, typeable token for a session id. Empty when unusable. */
export function shortSessionToken(sessionID: string | undefined): string {
  if (!sessionID) return '';
  const alnum = sessionID.replace(/[^A-Za-z0-9]/g, '');
  if (alnum.length < TOKEN_LENGTH) return '';
  return alnum.slice(-TOKEN_LENGTH);
}

/** Strip control characters so the value is safe inside an OSC title sequence. */
export function sanitizeTitleFragment(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX_LENGTH);
}

/** Terminal title the plugin tags onto its controlling terminal. */
export function terminalTitleFor(
  sessionID: string | undefined,
  sessionTitle: string | undefined
): string {
  const token = shortSessionToken(sessionID);
  if (!token) return '';
  const title = sanitizeTitleFragment(sessionTitle);
  return title.length > 0
    ? `opencode ${token} · ${title}`
    : `opencode ${token}`;
}

/** OSC 0 sequence that sets the terminal (tab) title. */
export function titleSequence(title: string): string {
  return `\u001b]0;${title}\u0007`;
}
