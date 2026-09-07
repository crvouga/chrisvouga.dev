import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { NOTIFIER_SOUNDS } from '../../opencode/sounds';
import type { GlobalOpts } from '../lib/cli-opts';
import { writeSoundConfig } from '../lib/notifier-build';
import { currentPlatform } from '../lib/platform/index';
import type { Platform } from '../lib/platform/types';
import {
  printJson,
  printOk,
  resolveOutputMode,
  section,
} from '../lib/output-and-theme';

type DefaultSounds = typeof NOTIFIER_SOUNDS;

export function readSounds(platform: Platform): Record<string, string> {
  const path = `${platform.opencodeDir()}/notifier-sounds.json`;
  if (!existsSync(path))
    return { ...(NOTIFIER_SOUNDS as Record<string, string>) };
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  } catch {
    return { ...(NOTIFIER_SOUNDS as Record<string, string>) };
  }
}

export async function cmdSoundsList(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const sounds = readSounds(platform);
  if (mode === 'json') {
    printJson({ ok: true, sounds, defaults: NOTIFIER_SOUNDS });
    return;
  }
  section('Sounds', 'per-kind notification sounds (macOS system sounds)');
  for (const [kind, sound] of Object.entries(sounds)) {
    console.log(`  ${kind}: ${sound}`);
  }
}

export async function cmdSoundsSet(
  kind: string,
  sound: string,
  opts: GlobalOpts
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const valid = Object.keys(NOTIFIER_SOUNDS);
  if (!valid.includes(kind)) {
    if (mode === 'json') {
      printJson({ ok: false, error: `unknown kind: ${kind}`, valid });
      process.exit(1);
    }
    throw new Error(`Unknown kind "${kind}" (valid: ${valid.join(', ')})`);
  }
  const path = `${platform.opencodeDir()}/notifier-sounds.json`;
  const sounds = readSounds(platform);
  sounds[kind] = sound;
  writeFileSync(path, `${JSON.stringify(sounds, null, 2)}\n`);
  if (mode === 'json') {
    printJson({ ok: true, path, kind, sound });
    return;
  }
  printOk(`Sound for ${kind} set to ${sound} → ${path}`);
}

export async function cmdSoundsReset(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const path = writeSoundConfig(platform);
  const sounds: DefaultSounds = NOTIFIER_SOUNDS;
  if (mode === 'json') {
    printJson({ ok: true, path, sounds });
    return;
  }
  printOk(`Sounds reset to defaults → ${path}`);
}
