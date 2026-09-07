import { DarwinPlatform } from './darwin';
import { detectPlatformName } from './detect';
import { FallbackPlatform } from './fallback';
import { LinuxPlatform } from './linux';
import { WindowsPlatform } from './windows';
import type { Platform, PlatformName } from './types';

export type { Platform, PlatformName } from './types';
export type {
  NotificationKind,
  NotifierCapability,
  NotifierTestResult,
  GlobalInstallResult,
} from './types';
export { detectPlatformName } from './detect';

/** Polymorphic factory — callers never branch on `process.platform` directly. */
export function getPlatform(name?: PlatformName): Platform {
  const resolved = name ?? detectPlatformName();
  switch (resolved) {
    case 'darwin':
      return new DarwinPlatform();
    case 'linux':
      return new LinuxPlatform();
    case 'windows':
      return new WindowsPlatform();
    case 'unknown':
      return new FallbackPlatform();
  }
}

let cached: Platform | null = null;

/** Memoized current-platform adapter. */
export function currentPlatform(): Platform {
  if (cached === null) cached = getPlatform();
  return cached;
}
