import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NOTIFIER_SOUNDS } from '../../opencode/sounds';
import type { Platform } from './platform/types';

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key><string>OpenCodeNotifier</string>
	<key>CFBundleIdentifier</key><string>dev.chrisvouga.OpenCodeNotifier</string>
	<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
	<key>CFBundleName</key><string>OpenCodeNotifier</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>CFBundleShortVersionString</key><string>1.0.0</string>
	<key>CFBundleVersion</key><string>1</string>
	<key>LSMinimumSystemVersion</key><string>11.0</string>
	<key>LSUIElement</key><true/>
</dict>
</plist>
`;

export type NotifierBuildResult = 'built' | 'unchanged' | 'skipped';

export function notifierPaths(platform: Platform): {
  source: string;
  app: string;
  hash: string;
  sounds: string;
} {
  // workstationRoot is derived by callers; source lives next to opencode/.
  // Kept here as a helper over explicit args for the sync flow.
  return {
    source: '',
    app: join(platform.opencodeDir(), 'bin/OpenCodeNotifier.app'),
    hash: join(platform.opencodeDir(), 'bin/.opencode-notifier.hash'),
    sounds: join(platform.opencodeDir(), 'notifier-sounds.json'),
  };
}

/** Write the runtime sound map consumed by the daemon + plugin fallback. */
export function writeSoundConfig(platform: Platform): string {
  const dest = join(platform.opencodeDir(), 'notifier-sounds.json');
  mkdirSync(platform.opencodeDir(), { recursive: true });
  const json = `${JSON.stringify(NOTIFIER_SOUNDS, null, 2)}\n`;
  writeFileSync(dest, json);
  return dest;
}

function commandExists(command: string): boolean {
  return (
    spawnSync('/usr/bin/which', [command], { stdio: 'ignore' }).status === 0
  );
}

/**
 * Compile OpenCodeNotifier.swift (macOS only). Rebuilds only when the source
 * hash changes. Returns `skipped` on platforms without swiftc.
 */
export function buildNotifier(
  workstationRoot: string,
  platform: Platform
): { result: NotifierBuildResult; detail: string } {
  const source = join(
    workstationRoot,
    'opencode/notifier/OpenCodeNotifier.swift'
  );
  const app = join(platform.opencodeDir(), 'bin/OpenCodeNotifier.app');
  const hashPath = join(platform.opencodeDir(), 'bin/.opencode-notifier.hash');

  if (!existsSync(source)) {
    return { result: 'skipped', detail: 'notifier source missing' };
  }
  if (platform.name !== 'darwin') {
    return {
      result: 'skipped',
      detail: `OpenCodeNotifier is macOS-only (platform: ${platform.label})`,
    };
  }
  const hash = createHash('sha256').update(readFileSync(source)).digest('hex');
  if (
    existsSync(app) &&
    existsSync(hashPath) &&
    readFileSync(hashPath, 'utf8').trim() === hash
  ) {
    return { result: 'unchanged', detail: app };
  }
  if (!commandExists('swiftc')) {
    return {
      result: 'skipped',
      detail: 'swiftc not found — notifications use the osascript fallback',
    };
  }

  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true });
  writeFileSync(join(app, 'Contents/Info.plist'), INFO_PLIST);

  const compile = spawnSync(
    'swiftc',
    [
      '-O',
      '-swift-version',
      '5',
      '-o',
      join(app, 'Contents/MacOS/OpenCodeNotifier'),
      source,
    ],
    { encoding: 'utf8' }
  );
  if (compile.status !== 0) {
    throw new Error(
      `Failed to compile OpenCodeNotifier (swiftc):\n${compile.stderr}\nFix the compile error and run \`ws sync\` again.`
    );
  }

  const sign = spawnSync('codesign', ['--force', '--sign', '-', app], {
    encoding: 'utf8',
  });
  if (sign.status !== 0) {
    throw new Error(
      `Failed to ad-hoc codesign OpenCodeNotifier:\n${sign.stderr}`
    );
  }

  writeFileSync(hashPath, `${hash}\n`);
  platform.restartNotifierDaemon();
  return { result: 'built', detail: app };
}
