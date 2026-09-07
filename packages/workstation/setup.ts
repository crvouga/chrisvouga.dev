#!/usr/bin/env bun
/**
 * Link workstation-managed configuration into the user's home directory and
 * build machine-local artifacts.
 *
 * Rules:
 *   - Idempotent: an already-correct symlink is a no-op ("success"); the
 *     notifier app rebuilds only when its source changes.
 *   - Never overwrites anything not managed by this repository.
 *   - Fails with an actionable message when the destination conflicts.
 *   - No sudo required (only touches $HOME).
 *   - Works regardless of the caller's current working directory (the
 *     repository root is derived from this file's location).
 *
 * Usage:
 *   bun run workspace:setup
 *   bun run packages/workstation/setup.ts
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { NOTIFIER_SOUNDS } from './opencode/sounds';

const WORKSTATION_ROOT = import.meta.dir;

type ManagedLink = {
  /** Short human description of the managed piece. */
  label: string;
  /** Absolute path to the checked-in source of truth in this repo. */
  target: string;
  /** Absolute path of the symlink in the user's home directory. */
  link: string;
};

const OPENCODE_DIR = join(homedir(), '.config/opencode');

/** Runtime sound map written from `NOTIFIER_SOUNDS`; read by the notifier and the plugin. */
const SOUNDS_CONFIG = join(OPENCODE_DIR, 'notifier-sounds.json');

const LINKS: ManagedLink[] = [
  {
    label: 'OpenCode notification plugin',
    target: join(WORKSTATION_ROOT, 'opencode/plugins/notifications.ts'),
    link: join(OPENCODE_DIR, 'plugins/notifications.ts'),
  },
  {
    label: 'OpenCode notifier CLI',
    target: join(WORKSTATION_ROOT, 'opencode/bin/opencode-notifier'),
    link: join(OPENCODE_DIR, 'bin/opencode-notifier'),
  },
  {
    label: 'OpenCode focus script (notification click handler)',
    target: join(WORKSTATION_ROOT, 'opencode/bin/focus-opencode'),
    link: join(OPENCODE_DIR, 'bin/focus-opencode'),
  },
];

function statOrUndefined(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

function symlinkTarget(linkPath: string) {
  try {
    return readlinkSync(linkPath);
  } catch {
    return undefined;
  }
}

function install(managed: ManagedLink): 'created' | 'unchanged' {
  const stat = statOrUndefined(managed.link);
  if (stat === undefined) {
    mkdirSync(dirname(managed.link), { recursive: true });
    symlinkSync(managed.target, managed.link);
    return 'created';
  }

  if (!stat.isSymbolicLink()) {
    throw new Error(
      `Conflict: ${managed.link} already exists and is not a symlink managed by this repository.\n` +
        `Move or remove it, then run \`bun run workspace:setup\` again.`
    );
  }

  const current = symlinkTarget(managed.link);
  if (current === managed.target) return 'unchanged';

  throw new Error(
    `Conflict: ${managed.link} is a symlink to ${current ?? '<unreadable>'}, not to ${managed.target}.\n` +
      `Remove it, then run \`bun run workspace:setup\` again.`
  );
}

// --- OpenCodeNotifier build -------------------------------------------------

const NOTIFIER_SOURCE = join(
  WORKSTATION_ROOT,
  'opencode/notifier/OpenCodeNotifier.swift'
);
const NOTIFIER_APP = join(OPENCODE_DIR, 'bin/OpenCodeNotifier.app');
const NOTIFIER_HASH = join(OPENCODE_DIR, 'bin/.opencode-notifier.hash');

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

function commandExists(command: string): boolean {
  return (
    spawnSync('/usr/bin/which', [command], { stdio: 'ignore' }).status === 0
  );
}

/**
 * Compile OpenCodeNotifier.swift into ~/.config/opencode/bin/OpenCodeNotifier.app.
 * Rebuilds only when the source hash changes. Skips (with a warning) when
 * swiftc is unavailable — the plugin then falls back to plain notifications.
 */
function buildNotifier(): 'built' | 'unchanged' | 'skipped' {
  if (!existsSync(NOTIFIER_SOURCE)) return 'skipped';
  const hash = createHash('sha256')
    .update(readFileSync(NOTIFIER_SOURCE))
    .digest('hex');
  if (
    existsSync(NOTIFIER_APP) &&
    existsSync(NOTIFIER_HASH) &&
    readFileSync(NOTIFIER_HASH, 'utf8').trim() === hash
  ) {
    return 'unchanged';
  }
  if (!commandExists('swiftc')) {
    console.warn(
      `  warn: swiftc not found — skipping OpenCodeNotifier build (notifications will use the osascript fallback)`
    );
    return 'skipped';
  }

  mkdirSync(join(NOTIFIER_APP, 'Contents/MacOS'), { recursive: true });
  writeFileSync(join(NOTIFIER_APP, 'Contents/Info.plist'), INFO_PLIST);

  const compile = spawnSync(
    'swiftc',
    [
      '-O',
      '-swift-version',
      '5',
      '-o',
      join(NOTIFIER_APP, 'Contents/MacOS/OpenCodeNotifier'),
      NOTIFIER_SOURCE,
    ],
    { encoding: 'utf8' }
  );
  if (compile.status !== 0) {
    throw new Error(
      `Failed to compile OpenCodeNotifier (swiftc):\n${compile.stderr}\n` +
        `Fix the compile error and run \`bun run workspace:setup\` again.`
    );
  }

  const sign = spawnSync('codesign', ['--force', '--sign', '-', NOTIFIER_APP], {
    encoding: 'utf8',
  });
  if (sign.status !== 0) {
    throw new Error(
      `Failed to ad-hoc codesign OpenCodeNotifier:\n${sign.stderr}`
    );
  }

  writeFileSync(NOTIFIER_HASH, `${hash}\n`);
  return 'built';
}

function main(): void {
  console.log(`Workstation setup (${WORKSTATION_ROOT})`);
  for (const managed of LINKS) {
    const status = install(managed);
    console.log(`  [${status}] ${managed.link}`);
    if (status === 'created') console.log(`      -> ${managed.target}`);
  }
  writeSoundConfig();
  const build = buildNotifier();
  if (build !== 'skipped') console.log(`  [${build}] ${NOTIFIER_APP}`);
  if (build === 'built') restartNotifierDaemon();
  configureOpenCodeProviders();
  console.log('Done.');
}

/**
 * Write the runtime sound map consumed by the notifier daemon and the plugin
 * (read per notification, so sound changes take effect without a rebuild).
 * Always runs so a sound edit in `opencode/sounds.ts` is reflected on every
 * `workspace:setup`.
 */
function writeSoundConfig(): void {
  mkdirSync(dirname(SOUNDS_CONFIG), { recursive: true });
  const json = `${JSON.stringify(NOTIFIER_SOUNDS, null, 2)}\n`;
  writeFileSync(SOUNDS_CONFIG, json);
  console.log(`  [written] ${SOUNDS_CONFIG}`);
}

/**
 * Kill any running notifier daemon so the freshly built app is used on the next
 * notification. Best-effort; the daemon is harmless to replace and restarts on
 * the next `--post`.
 */
function restartNotifierDaemon(): void {
  spawnSync('pkill', ['-f', 'OpenCodeNotifier.*--daemon'], { stdio: 'ignore' });
}

/**
 * Generate the global OpenCode provider config from the secret store. Best
 * effort: this never fails setup — when Vault is unavailable (or a provider
 * key is missing) it logs a warning and the notification setup still works.
 */
function configureOpenCodeProviders(): void {
  const script = join(WORKSTATION_ROOT, 'opencode/configure-providers.ts');
  if (!existsSync(script)) return;
  const result = spawnSync('bun', [script], {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status === null || result.status !== 0) {
    console.warn(
      `  warn: OpenCode provider config skipped (see messages above).\n` +
        `       Re-run \`bun run --filter @pkgs/workstation configure:opencode\` after authenticating to Vault.`
    );
  }
}

main();
