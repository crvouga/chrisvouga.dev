/**
 * Single source of truth for OpenCode notification sounds.
 *
 * Both consumers read from here:
 *   - `setup.ts`              -> writes `~/.config/opencode/notifier-sounds.json`
 *                                (the runtime config read by the notifier daemon)
 *   - `plugins/notifications.ts` -> osascript fallback defaults (imported)
 *
 * Sound names are macOS system sounds (from `/System/Library/Sounds`). The set
 * is deliberately calm, neutral, happy and low-key — no jarring or alarming
 * cues. Edit this map, then run `bun run opencode:setup` to sync the local
 * OpenCode install.
 */
export const NOTIFIER_SOUNDS = {
  finished: 'Glass',
  question: 'Tink',
  permission: 'Tink',
  error: 'Basso',
} as const;

export type NotifierKind = keyof typeof NOTIFIER_SOUNDS;
