import type { CrashHandler } from './crash-handler/crash-handler';
import { FallbackCrashHandler } from './crash-handler/crash-handler-default';

const handlers: CrashHandler[] = [];

/**
 * Register a crash handler. Lower {@link CrashHandler.priority} is consulted first.
 *
 * @returns Disposer to remove this handler.
 */
export function registerCrashHandler(handler: CrashHandler): () => void {
  handlers.push(handler);
  handlers.sort((a, b) => a.priority - b.priority);
  return () => {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

function dispatchCrash(
  message: string,
  context?: Record<string, unknown>
): void {
  for (const h of handlers) {
    if (h.match()) {
      h.crash(message, context);
      return;
    }
  }
  new FallbackCrashHandler().crash(message, context);
}

export function crash(
  condition: boolean,
  message: string,
  context?: Record<string, unknown>
): asserts condition {
  if (condition) return;

  log(message, context);
  dispatchCrash(message, context);
}

function log(message: string, context?: Record<string, unknown>) {
  console.error('[ASSERT]', message);
  if (context !== undefined) console.error('[CONTEXT]', context);
  console.error(new Error().stack);
}
