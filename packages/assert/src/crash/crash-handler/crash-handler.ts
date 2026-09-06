/**
 * Pluggable crash behavior for {@link Assert.crash} failures. Handlers are tried in ascending
 * {@link CrashHandler.priority} order; the first handler whose {@link CrashHandler.match} is true
 * runs {@link CrashHandler.crash}.
 */
export interface CrashHandler {
  readonly priority: number;
  match(): boolean;
  crash(message: string, context?: Record<string, unknown>): void;
}
