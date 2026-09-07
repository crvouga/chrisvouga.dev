import type { PlatformName } from './types';

/** Map `process.platform` onto the ws platform names. Pure — unit-tested. */
export function detectPlatformName(
  platform: NodeJS.Platform = process.platform
): PlatformName {
  if (platform === 'darwin') return 'darwin';
  if (platform === 'linux') return 'linux';
  if (platform === 'win32') return 'windows';
  return 'unknown';
}
