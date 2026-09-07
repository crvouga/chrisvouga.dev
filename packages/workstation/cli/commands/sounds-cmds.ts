import { NOTIFIER_SOUNDS } from '../../opencode/sounds';
import type { GlobalOpts } from '../lib/cli-opts';
import { currentPlatform } from '../lib/platform/index';
import type { Platform } from '../lib/platform/types';
import { askInput, askSelect } from '../lib/prompt';
import {
  NOTIFIER_KINDS,
  isKnownKind,
  isKnownSound,
  readSounds,
  resetSounds,
  setSound,
  soundsConfigPath,
} from '../lib/sounds';
import {
  muted,
  ok,
  printJson,
  printOk,
  printWarn,
  resolveOutputMode,
  section,
  warn as warnColor,
} from '../lib/output-and-theme';

export { readSounds };

type ConfigureOpts = GlobalOpts & {
  kind?: string | undefined;
  sound?: string | undefined;
};

function soundsPayload(platform: Platform): {
  path: string;
  sounds: Record<string, string>;
  defaults: typeof NOTIFIER_SOUNDS;
  available: string[];
  capabilities: ReturnType<Platform['notifierCapabilities']>;
} {
  return {
    path: soundsConfigPath(platform),
    sounds: readSounds(platform),
    defaults: NOTIFIER_SOUNDS,
    available: platform.availableSystemSounds(),
    capabilities: platform.notifierCapabilities(),
  };
}

function printSoundsHuman(platform: Platform): void {
  const { path, sounds, available, capabilities } = soundsPayload(platform);
  section('Notification sounds', path);
  for (const kind of NOTIFIER_KINDS) {
    const sound = sounds[kind] ?? muted('unset');
    const mark =
      available.length === 0
        ? warnColor('!')
        : available.includes(sound)
          ? ok('✓')
          : warnColor('?');
    console.log(`  ${mark} ${kind}: ${sound}`);
  }
  const extra = Object.keys(sounds).filter((k) => !isKnownKind(k));
  for (const kind of extra)
    console.log(`  ${muted('·')} ${kind}: ${sounds[kind]}`);
  if (capabilities.sounds) {
    console.log(
      `  ${muted(`available: ${available.join(', ') || 'none found'}`)}`
    );
  } else {
    console.log(`  ${muted(capabilities.reason ?? 'sounds unsupported here')}`);
  }
}

export async function cmdSoundsList(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  if (mode === 'json') {
    printJson({ ok: true, ...soundsPayload(platform) });
    return;
  }
  printSoundsHuman(platform);
}

export async function cmdSoundsStatus(opts: GlobalOpts): Promise<void> {
  await cmdSoundsList(opts);
}

export async function cmdSoundsSet(
  kind: string,
  sound: string,
  opts: GlobalOpts
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  if (!isKnownKind(kind)) {
    if (mode === 'json') {
      printJson({
        ok: false,
        error: `unknown kind: ${kind}`,
        valid: NOTIFIER_KINDS,
      });
      process.exit(1);
    }
    throw new Error(
      `Unknown kind "${kind}" (valid: ${NOTIFIER_KINDS.join(', ')})`
    );
  }
  const clean = sound.trim();
  if (clean.length === 0) throw new Error('Sound name must not be empty.');
  const path = setSound(platform, kind, clean);
  const known = isKnownSound(platform, clean);
  if (mode === 'json') {
    printJson({ ok: true, path, kind, sound: clean, known });
    return;
  }
  printOk(`Sound for ${kind} set to ${clean} → ${path}`);
  if (!known && platform.notifierCapabilities().sounds) {
    printWarn(
      `Unknown system sound "${clean}" — preview with \`ws opencode notifications sounds play ${clean}\` and see \`list\` for available names.`
    );
  }
}

export async function cmdSoundsReset(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const path = resetSounds(platform);
  if (mode === 'json') {
    printJson({ ok: true, path, sounds: NOTIFIER_SOUNDS });
    return;
  }
  printOk(`Sounds reset to defaults → ${path}`);
}

/**
 * Preview a sound: `play <kind>` plays that kind's configured sound,
 * `play <sound-name>` plays the named system sound directly.
 */
export async function cmdSoundsPlay(
  target: string,
  opts: GlobalOpts
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const sounds = readSounds(platform);
  const sound = sounds[target] ?? target;
  const result = await platform.playSystemSound(sound);
  if (mode === 'json') {
    printJson({ target, sound, ...result });
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    printOk(result.detail);
    return;
  }
  throw new Error(result.detail);
}

/**
 * First-class configurator: pick a kind, pick a sound from the available
 * system sounds (with preview), save. Fully scriptable via flags:
 * `sounds configure --kind finished --sound Purr [--play]`.
 */
export async function cmdSoundsConfigure(
  opts: ConfigureOpts & { play?: boolean | undefined }
): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);

  if (opts.kind !== undefined && opts.sound !== undefined) {
    await cmdSoundsSet(opts.kind, opts.sound, opts);
    if (opts.play === true) await cmdSoundsPlay(opts.kind, opts);
    return;
  }
  if (mode === 'json') {
    printJson({ ok: true, ...soundsPayload(platform) });
    return;
  }
  if (opts.nonInteractive === true) {
    throw new Error(
      'sounds configure needs --kind <kind> --sound <name> in non-interactive mode'
    );
  }
  const kind = await pickKind(platform, opts);
  const sound = await pickSound(platform, kind, opts);
  const preview = await platform.playSystemSound(sound);
  console.log(`  ${muted(preview.detail)}`);
  await cmdSoundsSet(kind, sound, opts);
}

async function pickKind(
  platform: Platform,
  opts: ConfigureOpts
): Promise<string> {
  if (opts.kind !== undefined) return opts.kind;
  const sounds = readSounds(platform);
  const kind = await askSelect({
    message: 'Which notification sound?',
    description: 'Pick the event kind to configure',
    ...(opts.nonInteractive !== undefined
      ? { nonInteractive: opts.nonInteractive }
      : {}),
    choices: NOTIFIER_KINDS.map((k) => ({
      name: `${k} (now: ${sounds[k] ?? 'unset'})`,
      value: k,
      description: kindBlurb(k),
    })),
  });
  if (!isKnownKind(kind)) throw new Error(`Unknown kind "${kind}".`);
  return kind;
}

function soundChoices(
  platform: Platform,
  kind: string,
  sounds: Record<string, string>
): Array<{ name: string; value: string; description?: string }> {
  const available = platform.availableSystemSounds();
  const defaults = NOTIFIER_SOUNDS as Record<string, string>;
  if (available.length === 0) {
    return [
      {
        name: 'Custom name…',
        value: '__custom',
        description: 'Type a macOS system sound name',
      },
    ];
  }
  return [
    ...available.map((s) => ({
      name: `${s}${s === sounds[kind] ? ' (current)' : ''}${s === defaults[kind] ? ' (default)' : ''}`,
      value: s,
      description: s === sounds[kind] ? 'Currently configured' : 'System sound',
    })),
    {
      name: 'Custom name…',
      value: '__custom',
      description: 'Type a sound name not in the list',
    },
  ];
}

async function pickSound(
  platform: Platform,
  kind: string,
  opts: ConfigureOpts
): Promise<string> {
  if (opts.sound !== undefined) return opts.sound;
  const sounds = readSounds(platform);
  const defaults = NOTIFIER_SOUNDS as Record<string, string>;
  const picked = await askSelect({
    message: `Sound for ${kind}`,
    description: `Now: ${sounds[kind] ?? 'unset'} · default: ${defaults[kind]}`,
    ...(opts.nonInteractive !== undefined
      ? { nonInteractive: opts.nonInteractive }
      : {}),
    choices: soundChoices(platform, kind, sounds),
  });
  if (picked !== '__custom') return picked;
  return askInput({
    message: `Sound for ${kind}`,
    description: 'macOS system sound name (e.g. Purr, Pop, Ping, Bottle)',
    default: sounds[kind] ?? '',
    ...(opts.nonInteractive !== undefined
      ? { nonInteractive: opts.nonInteractive }
      : {}),
  });
}

function kindBlurb(kind: string): string {
  switch (kind) {
    case 'finished':
      return 'Session finished';
    case 'question':
      return 'Agent has a question';
    case 'permission':
      return 'Permission required';
    case 'error':
      return 'Session error';
    default:
      return 'Notification event';
  }
}
