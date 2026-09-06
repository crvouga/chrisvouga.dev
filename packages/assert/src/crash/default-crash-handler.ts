import type { CrashHandler } from './crash-handler/crash-handler';
import { FallbackCrashHandler } from './crash-handler/crash-handler-default';
import { NodeCrashHandler } from './crash-handler/crash-handler-node';

/** Registered from `singleton.ts`: Node exit, else uncatchable throw. */
export class DefaultCrashHandler implements CrashHandler {
  readonly priority = 100;

  private readonly node = new NodeCrashHandler();
  private readonly fallback = new FallbackCrashHandler();

  match(): boolean {
    return true;
  }

  crash(message: string, context?: Record<string, unknown>): void {
    if (this.node.match()) {
      this.node.crash(message, context);
      return;
    }
    this.fallback.crash(message, context);
  }
}
