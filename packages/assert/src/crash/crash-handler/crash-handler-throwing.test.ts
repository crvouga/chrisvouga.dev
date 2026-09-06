import { describe, expect, it } from 'bun:test';
import { AssertCrashError } from './assert-crash-error';
import { ThrowingCrashHandler } from './crash-handler-throwing';

describe('ThrowingCrashHandler', () => {
  it('matches in every runtime', () => {
    expect(new ThrowingCrashHandler().match()).toBe(true);
  });

  it('uses priority 10 (beats NodeCrashHandler at 30)', () => {
    expect(new ThrowingCrashHandler().priority).toBe(10);
  });

  it('throws AssertCrashError preserving message + context', () => {
    const handler = new ThrowingCrashHandler();
    const context = { entityType: 'foo', attribute: 'foo/bar' };
    try {
      handler.crash('boom', context);
      throw new Error('handler.crash should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AssertCrashError);
      const err = e as AssertCrashError;
      expect(err.message).toBe('boom');
      expect(err.context).toEqual(context);
      expect(err.isAssertCrash).toBe(true);
      expect(err.name).toBe('AssertCrashError');
    }
  });

  it('throws AssertCrashError with undefined context when omitted', () => {
    const handler = new ThrowingCrashHandler();
    try {
      handler.crash('no ctx');
      throw new Error('handler.crash should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AssertCrashError);
      const err = e as AssertCrashError;
      expect(err.context).toBeUndefined();
    }
  });
});
