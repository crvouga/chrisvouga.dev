import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FOCUS_REQUEST_FILENAME,
  FOCUS_REQUEST_TTL_MS,
  editorTabQuery,
  focusRequestPath,
  isFocusRequestFresh,
  panelTerminalQuery,
  readFocusRequest,
  resolveFocusTarget,
  shouldNavigateToSession,
  writeFocusRequest,
  type FocusRequest,
} from './focus-request';

function tmpCache(): string {
  return mkdtempSync(join(tmpdir(), 'ws-focus-'));
}

test('focusRequestPath lives in the cache dir', () => {
  expect(focusRequestPath('/tmp/cache')).toBe(
    join('/tmp/cache', FOCUS_REQUEST_FILENAME)
  );
});

test('writeFocusRequest round-trips through readFocusRequest', () => {
  const cache = tmpCache();
  const written = writeFocusRequest(cache, 'ses_abc123', 1_000);
  expect(written).toEqual({ sessionID: 'ses_abc123', timestamp: 1_000 });
  expect(readFocusRequest(cache)).toEqual(written);
});

test('readFocusRequest is undefined when missing or malformed', () => {
  expect(readFocusRequest(tmpCache())).toBeUndefined();

  const badJson = tmpCache();
  writeFileSync(focusRequestPath(badJson), 'not json{');
  expect(readFocusRequest(badJson)).toBeUndefined();

  const wrongShape = tmpCache();
  writeFileSync(focusRequestPath(wrongShape), JSON.stringify({ nope: true }));
  expect(readFocusRequest(wrongShape)).toBeUndefined();

  const emptySession = tmpCache();
  writeFileSync(
    focusRequestPath(emptySession),
    JSON.stringify({ sessionID: '', timestamp: 1 })
  );
  expect(readFocusRequest(emptySession)).toBeUndefined();

  const badTimestamp = tmpCache();
  writeFileSync(
    focusRequestPath(badTimestamp),
    JSON.stringify({ sessionID: 'ses_x', timestamp: 'now' })
  );
  expect(readFocusRequest(badTimestamp)).toBeUndefined();
});

test('isFocusRequestFresh honors the TTL window', () => {
  const base: FocusRequest = { sessionID: 'ses_x', timestamp: 10_000 };
  expect(isFocusRequestFresh(base, 10_000)).toBe(true);
  expect(isFocusRequestFresh(base, 10_000 + FOCUS_REQUEST_TTL_MS)).toBe(true);
  expect(isFocusRequestFresh(base, 10_000 + FOCUS_REQUEST_TTL_MS + 1)).toBe(
    false
  );
  // From the future: clock skew, never act on it.
  expect(isFocusRequestFresh(base, 9_999)).toBe(false);
});

test('shouldNavigateToSession only routes the owning, outdated TUI', () => {
  const fresh: FocusRequest = { sessionID: 'ses_new', timestamp: 5_000 };
  const now = 6_000;

  // Fresh + owned + showing something else → navigate.
  expect(shouldNavigateToSession({ name: 'home' }, fresh, true, now)).toBe(
    true
  );
  expect(
    shouldNavigateToSession(
      { name: 'session', sessionID: 'ses_old' },
      fresh,
      true,
      now
    )
  ).toBe(true);

  // Already showing the requested session → stay.
  expect(
    shouldNavigateToSession(
      { name: 'session', sessionID: 'ses_new' },
      fresh,
      true,
      now
    )
  ).toBe(false);

  // A TUI that does not own the session must ignore the request (this is
  // what routes the click to the right window/tab instance).
  expect(shouldNavigateToSession({ name: 'home' }, fresh, false, now)).toBe(
    false
  );

  // Stale requests never navigate (no yanking on startup).
  const stale: FocusRequest = { sessionID: 'ses_new', timestamp: 5_000 };
  expect(
    shouldNavigateToSession(
      { name: 'home' },
      stale,
      true,
      now + FOCUS_REQUEST_TTL_MS + 1
    )
  ).toBe(false);
});

test('resolveFocusTarget prefers token, then title, then opencode', () => {
  expect(resolveFocusTarget({ token: 'AbC1234', title: 'Fix bug' })).toBe(
    'AbC1234'
  );
  expect(resolveFocusTarget({ token: '  ', title: 'Fix bug' })).toBe('Fix bug');
  expect(resolveFocusTarget({})).toBe('opencode');
  expect(resolveFocusTarget({ token: undefined, title: undefined })).toBe(
    'opencode'
  );
});

test('Quick Open queries cover editor tabs and panel terminals', () => {
  // Editor-area terminals match by plain title query …
  expect(editorTabQuery('AbC1234')).toBe('AbC1234');
  // … while panel terminals only appear under the `term ` prefix, so a
  // plain-query-only handler can never focus them (the reported bug).
  expect(panelTerminalQuery('AbC1234')).toBe('term AbC1234');
  expect(panelTerminalQuery('AbC1234')).not.toBe(editorTabQuery('AbC1234'));
});

test('writeFocusRequest creates the cache dir when missing', () => {
  const cache = join(tmpCache(), 'nested', 'cache');
  writeFocusRequest(cache, 'ses_nested', 42);
  expect(readFocusRequest(cache)?.sessionID).toBe('ses_nested');
});

test('writeFocusRequest parent dirs exist', () => {
  const cache = tmpCache();
  mkdirSync(cache, { recursive: true });
  expect(readFocusRequest(cache)).toBeUndefined();
});
