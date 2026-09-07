import { expect, test } from 'bun:test';

import { detectPlatformName } from './detect';
import { getPlatform } from './index';

test('detectPlatformName maps node platforms', () => {
  expect(detectPlatformName('darwin')).toBe('darwin');
  expect(detectPlatformName('linux')).toBe('linux');
  expect(detectPlatformName('win32')).toBe('windows');
  expect(detectPlatformName('freebsd')).toBe('unknown');
});

test('getPlatform factory returns a matching adapter', () => {
  expect(getPlatform('darwin').name).toBe('darwin');
  expect(getPlatform('linux').name).toBe('linux');
  expect(getPlatform('windows').name).toBe('windows');
  expect(getPlatform('unknown').name).toBe('unknown');
});

test('every adapter exposes dirs and capabilities', () => {
  for (const name of ['darwin', 'linux', 'windows', 'unknown'] as const) {
    const platform = getPlatform(name);
    expect(platform.opencodeDir().length).toBeGreaterThan(0);
    expect(platform.cacheDir().length).toBeGreaterThan(0);
    expect(platform.globalBinDir().length).toBeGreaterThan(0);
    expect(platform.notifierCapabilities()).toBeDefined();
  }
});

test('only darwin builds the Swift notifier', () => {
  expect(getPlatform('darwin').canBuildSwiftNotifier()).toBe(
    getPlatform('darwin').canBuildSwiftNotifier()
  );
  expect(getPlatform('linux').canBuildSwiftNotifier()).toBe(false);
  expect(getPlatform('windows').canBuildSwiftNotifier()).toBe(false);
});
