import { join } from 'node:path';

import { FallbackPlatform } from './platform/fallback';

/** Test adapter — redirects all home-relative dirs into a tmp dir. */
export class TmpPlatform extends FallbackPlatform {
  constructor(private readonly tmp: string) {
    super();
  }

  override opencodeDir(): string {
    return join(this.tmp, '.config/opencode');
  }

  override cacheDir(): string {
    return join(this.tmp, '.cache');
  }

  override globalBinDir(): string {
    return join(this.tmp, '.local/bin');
  }
}
