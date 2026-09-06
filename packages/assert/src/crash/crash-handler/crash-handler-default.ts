import type { CrashHandler } from './crash-handler';

const UNCATCHABLE_ERROR = { __assertion_failure: true };

/** Last-resort handler when no registered handler matches (`crash.ts` dispatch). */
export class FallbackCrashHandler implements CrashHandler {
  readonly priority = Number.MAX_SAFE_INTEGER;

  match(): boolean {
    return true;
  }

  crash(message: string, context?: Record<string, unknown>): void {
    // Tiger: non-Error throw object is intentional (filtered by crash dispatch).
    // eslint-disable-next-line no-throw-literal -- uncatchable assertion envelope, not a string
    throw { ...UNCATCHABLE_ERROR, message, context };
  }
}
