/**
 * Platform abstraction for the `ws` CLI.
 *
 * Every OS-specific behavior lives behind this interface so the commands stay
 * platform-agnostic. Concrete adapters (darwin / linux / windows) implement
 * the same contract via polymorphism; `getPlatform()` is the factory.
 */

export type PlatformName = 'darwin' | 'linux' | 'windows' | 'unknown';

export type NotificationKind =
  'finished' | 'interrupted' | 'question' | 'permission' | 'error';

export type NotifierCapability = {
  /** Native rich notifications (click actions where supported). */
  readonly native: boolean;
  /** Per-kind sounds. */
  readonly sounds: boolean;
  /** Click-to-focus a project window/tab. */
  readonly clickToFocus: boolean;
  /** Human reason when a capability is unavailable. */
  readonly reason?: string;
};

export type NotifierTestResult = {
  readonly ok: boolean;
  readonly detail: string;
};

export type GlobalInstallResult = {
  readonly binDir: string;
  readonly launcherPath: string;
  readonly created: boolean;
  readonly alreadyOnPath: boolean;
};

export type Platform = {
  readonly name: PlatformName;
  readonly label: string;

  /** `~/.config/opencode` (or the OS equivalent). */
  opencodeDir(): string;
  /** `~/.cache` (or the OS equivalent) — daemon sockets live here. */
  cacheDir(): string;
  /** Preferred global bin dir (`~/.local/bin` or Windows equivalent). */
  globalBinDir(): string;

  /** Whether `swiftc` builds / shell shims apply on this platform. */
  canBuildSwiftNotifier(): boolean;
  /** Shell RC files to inspect when ensuring `~/.local/bin` is on PATH. */
  shellRcFiles(): readonly string[];

  notifierCapabilities(): NotifierCapability;
  /** Best-effort desktop notification. Never throws — returns a result. */
  postNotification(input: {
    title: string;
    message: string;
    kind: NotificationKind;
  }): Promise<NotifierTestResult>;

  /** Daemon process running? (best-effort, always safe when unknown). */
  isNotifierDaemonRunning(): boolean;
  /** Best-effort daemon restart (kill so the next `--post` relaunches). */
  restartNotifierDaemon(): void;

  /** System sound names available for per-kind configuration (sorted, unique). */
  availableSystemSounds(): string[];
  /** Preview a system sound by name. Never throws — returns a result. */
  playSystemSound(name: string): Promise<NotifierTestResult>;
};
