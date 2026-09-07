import { expect, test } from 'bun:test';

import {
  sanitizeTitleFragment,
  shortSessionToken,
  terminalTitleFor,
  titleSequence,
} from './session-token';

test('shortSessionToken takes the trailing alphanumerics of a session id', () => {
  expect(shortSessionToken('ses_f8544b407ffeHmm0Sb9AtQbt0N')).toBe('AtQbt0N');
});

test('shortSessionToken is empty when there is nothing usable', () => {
  expect(shortSessionToken(undefined)).toBe('');
  expect(shortSessionToken('')).toBe('');
  expect(shortSessionToken('ses_ab')).toBe('');
});

test('shortSessionToken strips separators before slicing', () => {
  expect(shortSessionToken('ses-abc-def-1234567')).toBe('1234567');
});

test('sanitizeTitleFragment strips control characters and trims', () => {
  expect(sanitizeTitleFragment('Fix login\nbug')).toBe('Fix login bug');
  expect(sanitizeTitleFragment('a\x1bb\x07c')).toBe('a b c');
  expect(sanitizeTitleFragment(undefined)).toBe('');
});

test('terminalTitleFor embeds the token and the sanitized title', () => {
  expect(
    terminalTitleFor('ses_f8544b407ffeHmm0Sb9AtQbt0N', 'Fix login bug')
  ).toBe('opencode AtQbt0N · Fix login bug');
  expect(terminalTitleFor('ses_f8544b407ffeHmm0Sb9AtQbt0N', undefined)).toBe(
    'opencode AtQbt0N'
  );
  expect(terminalTitleFor(undefined, 'Fix login bug')).toBe('');
});

test('titleSequence wraps the title in an OSC 0 sequence', () => {
  expect(titleSequence('opencode AtQbt0N')).toBe('\x1b]0;opencode AtQbt0N\x07');
});
