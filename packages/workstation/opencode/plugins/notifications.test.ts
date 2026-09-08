import { describe, expect, test } from 'bun:test';

import { isAbortError, isInterruptCommand } from './notifications';

describe('interrupt detection', () => {
  test('MessageAbortedError is an abort', () => {
    expect(
      isAbortError({
        name: 'MessageAbortedError',
        data: { message: 'Aborted' },
      })
    ).toBe(true);
  });

  test('abort-flavoured message is an abort', () => {
    expect(
      isAbortError({
        name: 'UnknownError',
        data: { message: 'Aborted process' },
      })
    ).toBe(true);
  });

  test('other errors are not aborts', () => {
    expect(
      isAbortError({ name: 'UnknownError', data: { message: 'boom' } })
    ).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('aborted')).toBe(false);
  });

  test('interrupt command matches session.interrupt', () => {
    expect(isInterruptCommand('session.interrupt')).toBe(true);
    expect(isInterruptCommand('session.compact')).toBe(false);
  });
});
