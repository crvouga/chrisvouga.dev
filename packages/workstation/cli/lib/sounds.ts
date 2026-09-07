import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { NOTIFIER_SOUNDS } from '../../opencode/sounds';
import type { Platform } from './platform/types';

export const NOTIFIER_KINDS = Object.keys(NOTIFIER_SOUNDS);

export function soundsConfigPath(platform: Platform): string {
  return join(platform.opencodeDir(), 'notifier-sounds.json');
}

/**
 * Read the runtime sound map. Merges stored overrides over the checked-in
 * defaults so a `ws sync` (or a new default kind) never wipes a user's
 * `sounds set` choice. Unknown keys are preserved for forward-compat.
 */
export function readSounds(platform: Platform): Record<string, string> {
  const defaults = { ...(NOTIFIER_SOUNDS as Record<string, string>) };
  const path = soundsConfigPath(platform);
  if (!existsSync(path)) return defaults;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    const stored = parsed as Record<string, unknown>;
    const merged = { ...defaults };
    for (const [kind, value] of Object.entries(stored)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        merged[kind] = value;
      }
    }
    return merged;
  } catch {
    return defaults;
  }
}

/** Write the full sound map (0600-style runtime config, never committed). */
export function writeSounds(
  platform: Platform,
  sounds: Record<string, string>
): string {
  const path = soundsConfigPath(platform);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sounds, null, 2)}\n`);
  return path;
}

/** Set one kind, preserving every other kind. Returns the config path. */
export function setSound(
  platform: Platform,
  kind: string,
  sound: string
): string {
  const sounds = readSounds(platform);
  sounds[kind] = sound;
  return writeSounds(platform, sounds);
}

/** Restore the checked-in defaults. Returns the config path. */
export function resetSounds(platform: Platform): string {
  return writeSounds(platform, {
    ...(NOTIFIER_SOUNDS as Record<string, string>),
  });
}

export function isKnownKind(kind: string): boolean {
  return NOTIFIER_KINDS.includes(kind);
}

export function isKnownSound(platform: Platform, sound: string): boolean {
  return platform.availableSystemSounds().includes(sound);
}
