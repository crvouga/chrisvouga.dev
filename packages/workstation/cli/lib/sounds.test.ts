import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { TmpPlatform } from './test-platform';
import { isKnownKind, readSounds, resetSounds, setSound } from './sounds';
import { NOTIFIER_SOUNDS } from '../../notifier/sounds';

function fresh(): TmpPlatform {
  return new TmpPlatform(mkdtempSync(join(tmpdir(), 'ws-sounds-')));
}

describe('sounds lib', () => {
  test('reads defaults when no config exists', () => {
    expect(readSounds(fresh())).toEqual({ ...NOTIFIER_SOUNDS });
  });

  test('set preserves other kinds', () => {
    const p = fresh();
    setSound(p, 'finished', 'Glass');
    const sounds = readSounds(p);
    expect(sounds['finished']).toBe('Glass');
    expect(sounds['question']).toBe(NOTIFIER_SOUNDS.question);
  });

  test('re-read merges overrides over defaults (sync-safe)', () => {
    const p = fresh();
    setSound(p, 'error', 'Hero');
    // Simulate `ws sync`: re-reading must keep the override.
    expect(readSounds(p)['error']).toBe('Hero');
  });

  test('reset restores defaults', () => {
    const p = fresh();
    setSound(p, 'finished', 'Glass');
    resetSounds(p);
    expect(readSounds(p)).toEqual({ ...NOTIFIER_SOUNDS });
  });

  test('known kinds validate', () => {
    expect(isKnownKind('finished')).toBe(true);
    expect(isKnownKind('nope')).toBe(false);
  });
});
