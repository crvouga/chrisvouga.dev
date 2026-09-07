import { execSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
  NotificationKind,
  NotifierCapability,
  NotifierTestResult,
  Platform,
} from './types';

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

export class DarwinPlatform implements Platform {
  readonly name = 'darwin' as const;
  readonly label = 'macOS';

  opencodeDir(): string {
    return join(homedir(), '.config/opencode');
  }

  cacheDir(): string {
    return join(homedir(), '.cache');
  }

  globalBinDir(): string {
    return join(homedir(), '.local/bin');
  }

  canBuildSwiftNotifier(): boolean {
    return (
      spawnSync('/usr/bin/which', ['swiftc'], { stdio: 'ignore' }).status === 0
    );
  }

  shellRcFiles(): readonly string[] {
    const home = homedir();
    return [
      join(home, '.zshrc'),
      join(home, '.bashrc'),
      join(home, '.bash_profile'),
      join(home, '.config/fish/config.fish'),
    ];
  }

  notifierCapabilities(): NotifierCapability {
    return { native: true, sounds: true, clickToFocus: true };
  }

  async postNotification(input: {
    title: string;
    message: string;
    kind: NotificationKind;
  }): Promise<NotifierTestResult> {
    const cli = join(this.opencodeDir(), 'bin/opencode-notifier');
    try {
      const { existsSync } = await import('node:fs');
      if (existsSync(cli)) {
        const body = JSON.stringify({
          kind: input.kind,
          title: input.title,
          message: input.message,
          subtitle: 'ws test',
          sessionID: 'ses_ws_test',
          directory: process.cwd(),
          sessionTitle: 'ws test',
          token: '',
        });
        const r = spawnSync(cli, ['--post', body], { encoding: 'utf8' });
        if (r.status === 0) {
          return { ok: true, detail: 'posted via OpenCodeNotifier daemon' };
        }
      }
    } catch {
      // Fall through to osascript.
    }
    try {
      const script = `display notification ${appleScriptString(input.message)} with title ${appleScriptString(input.title)}`;
      execSync(`osascript -e ${JSON.stringify(script)}`, { stdio: 'ignore' });
      return { ok: true, detail: 'posted via osascript fallback' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `osascript failed: ${msg}` };
    }
  }

  isNotifierDaemonRunning(): boolean {
    try {
      const out = execSync('pgrep -fl "OpenCodeNotifier.*daemon"', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out.trim().length > 0;
    } catch {
      return false;
    }
  }

  restartNotifierDaemon(): void {
    spawnSync('pkill', ['-f', 'OpenCodeNotifier.*--daemon'], {
      stdio: 'ignore',
    });
  }
}
