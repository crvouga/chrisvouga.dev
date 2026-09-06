import type { CrashHandler } from './crash-handler';

export class NodeCrashHandler implements CrashHandler {
  readonly priority: number = 30;
  match(): boolean {
    return typeof process !== 'undefined' && typeof process.exit === 'function';
  }
  crash(message: string, context?: Record<string, unknown>): void {
    console.error(message, context);
    process.exit(1);
  }
}
