/**
 * Shared click-to-focus protocol: terminal-tab targeting + session routing.
 *
 * Two processes cooperate through this module's conventions (no direct IPC):
 *
 * - `opencode/bin/focus-opencode` (bash, runs on banner click) focuses the VS
 *   Code window and terminal tab, and writes a focus request file.
 * - `opencode/tui/focus-session.ts` (TUI plugin, runs inside every opencode
 *   TUI) polls that file and navigates the owning TUI to the session via
 *   `route.navigate("session", { sessionID })`.
 * - `ws notifications focus|focus-request|tag` (CLI) drives the same flow for
 *   manual testing.
 *
 * Everything here is pure except the two small file helpers, so the routing
 * decision is unit-testable without a running TUI.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Focus-request file name inside the platform cache dir (`~/.cache`). */
export const FOCUS_REQUEST_FILENAME = 'opencode-focus-request.json';

/**
 * How long a focus request stays actionable. Clicks older than this are
 * ignored so a stale file can never yank a TUI to the wrong session on
 * startup.
 */
export const FOCUS_REQUEST_TTL_MS = 60_000;

/** How often the TUI plugin polls for a new focus request. */
export const FOCUS_REQUEST_POLL_MS = 750;

export type FocusRequest = {
  sessionID: string;
  /** Epoch milliseconds (Date.now()). */
  timestamp: number;
};

/** Absolute path of the focus-request file for a cache dir. */
export function focusRequestPath(cacheDir: string): string {
  return join(cacheDir, FOCUS_REQUEST_FILENAME);
}

/**
 * Write a focus request (banner-click equivalent). Best-effort callers wrap
 * this in try/catch — a failed write must never break the window/tab focus.
 */
export function writeFocusRequest(
  cacheDir: string,
  sessionID: string,
  now?: number | undefined
): FocusRequest {
  const request: FocusRequest = {
    sessionID,
    timestamp: now ?? Date.now(),
  };
  const path = focusRequestPath(cacheDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(request)}\n`);
  return request;
}

/** Read the current focus request. Undefined when missing or malformed. */
export function readFocusRequest(cacheDir: string): FocusRequest | undefined {
  try {
    const parsed = JSON.parse(
      readFileSync(focusRequestPath(cacheDir), 'utf8')
    ) as unknown;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('sessionID' in parsed) ||
      !('timestamp' in parsed)
    ) {
      return undefined;
    }
    const { sessionID, timestamp } = parsed as {
      sessionID: unknown;
      timestamp: unknown;
    };
    if (
      typeof sessionID !== 'string' ||
      sessionID.length === 0 ||
      typeof timestamp !== 'number' ||
      !Number.isFinite(timestamp)
    ) {
      return undefined;
    }
    return { sessionID, timestamp };
  } catch {
    return undefined;
  }
}

/** True when the request is recent enough to act on. */
export function isFocusRequestFresh(
  request: FocusRequest,
  now?: number | undefined
): boolean {
  const at = now ?? Date.now();
  const age = at - request.timestamp;
  return age >= 0 && age <= FOCUS_REQUEST_TTL_MS;
}

export type TuiRouteSnapshot =
  | { name: 'session'; sessionID: string }
  | { name: string; sessionID?: string | undefined };

/**
 * Decide whether the TUI showing `current` should navigate to the requested
 * session. True only when the request is fresh, this TUI owns the session
 * (`sessionExists`), and it is not already showing it.
 */
export function shouldNavigateToSession(
  current: TuiRouteSnapshot,
  request: FocusRequest,
  sessionExists: boolean,
  now?: number | undefined
): boolean {
  if (!sessionExists) return false;
  if (!isFocusRequestFresh(request, now)) return false;
  if (current.name === 'session' && current.sessionID === request.sessionID) {
    return false;
  }
  return true;
}

/**
 * Exact-match target for the terminal tab: the per-session token the plugin
 * wrote into the terminal title, else the session title, else `opencode`.
 */
export function resolveFocusTarget(input: {
  token?: string | undefined;
  title?: string | undefined;
}): string {
  const token = input.token?.trim() ?? '';
  if (token.length > 0) return token;
  const title = input.title?.trim() ?? '';
  if (title.length > 0) return title;
  return 'opencode';
}

/**
 * Quick Open (`Cmd+P`) query that matches an editor-area terminal tab by its
 * tagged title.
 */
export function editorTabQuery(target: string): string {
  return target;
}

/**
 * Quick Open (`Cmd+P`) query that matches a terminal-panel terminal by name.
 * VS Code's Quick Open lists panel terminals under the `term ` prefix
 * (typing `term <name>` filters them); plain queries only match editors, so
 * panel terminals need this form.
 */
export function panelTerminalQuery(target: string): string {
  return `term ${target}`;
}
