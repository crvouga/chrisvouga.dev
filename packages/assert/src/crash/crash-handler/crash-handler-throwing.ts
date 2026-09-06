import { AssertCrashError } from './assert-crash-error';
import type { CrashHandler } from './crash-handler';

/**
 * Crash handler that throws {@link AssertCrashError} instead of terminating
 * the runtime. Use on server runtimes (Cloudflare Workers, wrangler dev,
 * long-running services) where the host's catch boundary needs the failure
 * as a normal error — e.g. to bubble it over an HTTP wire so the client can
 * re-raise the same crash locally.
 *
 * Register with priority `10` so it beats `NodeCrashHandler` (priority `30`)
 * and the default fallback (priority `100`).
 */
export class ThrowingCrashHandler implements CrashHandler {
  readonly priority = 10;
  match(): boolean {
    return true;
  }
  crash(message: string, context?: Record<string, unknown>): void {
    throw new AssertCrashError(message, context);
  }
}
