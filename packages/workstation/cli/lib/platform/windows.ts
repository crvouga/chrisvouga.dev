import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import type {
  NotificationKind,
  NotifierCapability,
  NotifierTestResult,
  Platform,
} from './types';

export class WindowsPlatform implements Platform {
  readonly name = 'windows' as const;
  readonly label = 'Windows';

  opencodeDir(): string {
    const base =
      process.env['APPDATA']?.trim() || join(homedir(), 'AppData/Roaming');
    return join(base, 'opencode');
  }

  cacheDir(): string {
    const base =
      process.env['LOCALAPPDATA']?.trim() || join(homedir(), 'AppData/Local');
    return join(base, 'opencode-cache');
  }

  globalBinDir(): string {
    return join(homedir(), '.local/bin');
  }

  canBuildSwiftNotifier(): boolean {
    return false;
  }

  shellRcFiles(): readonly string[] {
    return [];
  }

  notifierCapabilities(): NotifierCapability {
    return {
      native: true,
      sounds: false,
      clickToFocus: false,
      reason:
        'Windows uses a PowerShell toast fallback (no sounds, no click-to-focus); the macOS OpenCodeNotifier app is macOS-only.',
    };
  }

  async postNotification(input: {
    title: string;
    message: string;
    kind: NotificationKind;
  }): Promise<NotifierTestResult> {
    void input.kind;
    try {
      const ps = [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `New-BurntToastNotification -Text ${JSON.stringify(input.title)}, ${JSON.stringify(input.message)}`,
      ];
      execFileSync('powershell', ps, { stdio: 'ignore' });
      return { ok: true, detail: 'posted via BurntToast' };
    } catch {
      // Fall through to msg.exe.
    }
    const r = spawnSync('msg', ['*', `${input.title}: ${input.message}`], {
      stdio: 'ignore',
    });
    if (r.status === 0) return { ok: true, detail: 'posted via msg' };
    return {
      ok: false,
      detail:
        'no notifier found (install BurntToast: Install-Module BurntToast)',
    };
  }

  isNotifierDaemonRunning(): boolean {
    return false;
  }

  restartNotifierDaemon(): void {
    // No daemon on Windows — no-op.
  }
}
