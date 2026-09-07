import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
  NotificationKind,
  NotifierCapability,
  NotifierTestResult,
  Platform,
} from './types';

export class LinuxPlatform implements Platform {
  readonly name = 'linux' as const;
  readonly label = 'Linux';

  opencodeDir(): string {
    const base =
      process.env['XDG_CONFIG_HOME']?.trim() || join(homedir(), '.config');
    return join(base, 'opencode');
  }

  cacheDir(): string {
    const base =
      process.env['XDG_CACHE_HOME']?.trim() || join(homedir(), '.cache');
    return base;
  }

  globalBinDir(): string {
    return join(homedir(), '.local/bin');
  }

  canBuildSwiftNotifier(): boolean {
    return false;
  }

  shellRcFiles(): readonly string[] {
    const home = homedir();
    return [
      join(home, '.bashrc'),
      join(home, '.bash_profile'),
      join(home, '.zshrc'),
      join(home, '.config/fish/config.fish'),
    ];
  }

  notifierCapabilities(): NotifierCapability {
    return {
      native: true,
      sounds: false,
      clickToFocus: false,
      reason:
        'Linux uses notify-send (no sounds, no click-to-focus); the macOS OpenCodeNotifier app is macOS-only.',
    };
  }

  async postNotification(input: {
    title: string;
    message: string;
    kind: NotificationKind;
  }): Promise<NotifierTestResult> {
    void input.kind;
    const candidates: ReadonlyArray<{ cmd: string; args: string[] }> = [
      { cmd: 'notify-send', args: [input.title, input.message] },
      { cmd: 'zenity', args: ['--notification', `--text=${input.message}`] },
    ];
    for (const candidate of candidates) {
      const r = spawnSync(candidate.cmd, candidate.args, { stdio: 'ignore' });
      if (r.status === 0) {
        return { ok: true, detail: `posted via ${candidate.cmd}` };
      }
    }
    return {
      ok: false,
      detail: 'no notifier found (install libnotify: notify-send)',
    };
  }

  isNotifierDaemonRunning(): boolean {
    return false;
  }

  restartNotifierDaemon(): void {
    // No daemon on Linux — no-op.
  }

  availableSystemSounds(): string[] {
    return [];
  }

  async playSystemSound(name: string): Promise<NotifierTestResult> {
    void name;
    return {
      ok: false,
      detail: 'sounds unsupported on Linux (notify-send has no sound API)',
    };
  }
}
