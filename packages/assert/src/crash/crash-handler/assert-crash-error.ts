/**
 * Error subtype carrying the original {@link Assert.crash} message + structured
 * context. Thrown by {@link ThrowingCrashHandler} so a host (HTTP handler,
 * job runner, etc.) can catch the failure, serialize the context across a
 * boundary, and let the consumer re-run the same crash on its own side with
 * the original payload intact.
 *
 * Carries an `isAssertCrash: true` discriminant so callers can detect it
 * across realms (Web Worker / shared memory / structured-clone wire) where
 * `instanceof` does not survive.
 */
export class AssertCrashError extends Error {
  readonly context: Record<string, unknown> | undefined;
  readonly isAssertCrash = true as const;
  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'AssertCrashError';
    this.context = context;
  }
}
