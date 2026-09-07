/**
 * Single source of truth for OpenCode notification sounds.
 *
 * Both consumers read from here:
 *   - `setup.ts`              -> writes `~/.config/opencode/notifier-sounds.json`
 *                                (the runtime config read by the notifier daemon)
 *   - `plugins/notifications.ts` -> osascript fallback defaults (imported)
 *
 * Sound names are macOS system sounds (from `/System/Library/Sounds`). The set
 * is deliberately calm, neutral, happy and low-key — soft, warm, short cues with
 * no jarring or alarming tones. Edit this map, then run
 * `ws sync` to sync the local OpenCode install.
 */
export const NOTIFIER_SOUNDS = {
  finished: 'Purr',
  question: 'Pop',
  permission: 'Ping',
  error: 'Bottle',
} as const;

export type NotifierKind = keyof typeof NOTIFIER_SOUNDS;
