import { spawn, type SpawnOptions } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readPidFile(file: string): number | null {
  if (!existsSync(file)) return null;
  try {
    const pid = Number(readFileSync(file, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function writePidFile(file: string, pid: number): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${pid}\n`, { mode: 0o600 });
}

export function removePidFile(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    // ignore
  }
}

/** Live pid from file, or null if missing/stale (stale file removed). */
export function livePidFromFile(file: string): number | null {
  const pid = readPidFile(file);
  if (pid === null) return null;
  if (isPidAlive(pid)) return pid;
  removePidFile(file);
  return null;
}

/** PIDs listening on TCP port (macOS/Linux lsof). */
export function pidsOnPort(port: string): number[] {
  try {
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    if (!out) return [];
    return [
      ...new Set(
        out
          .split(/\s+/)
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
  } catch {
    return [];
  }
}

export function stopPortOccupants(port: string): boolean {
  const pids = pidsOnPort(port);
  if (pids.length === 0) return false;
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`stopped process on :${port} (pid ${pid})`);
    } catch (err) {
      console.warn(
        `could not stop pid ${pid} on :${port}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return true;
}

/** Kill process group first (detached daemons), then the pid itself. */
export function killProcessTree(pid: number): void {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // not a group leader / already gone
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already gone
  }
}

export function stopDaemon(pidFile: string, label: string): boolean {
  const pid = readPidFile(pidFile);
  if (pid === null) {
    removePidFile(pidFile);
    return false;
  }
  if (!isPidAlive(pid)) {
    console.log(`stale ${label} pid file (${pid})`);
    removePidFile(pidFile);
    return false;
  }
  killProcessTree(pid);
  removePidFile(pidFile);
  console.log(`stopped ${label} (pid ${pid})`);
  return true;
}

export type SpawnDaemonOpts = {
  cmd: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  pidFile: string;
  logFile: string;
};

/**
 * Start a background process (new process group on Unix), append logs, write pid, unref.
 */
export function spawnDaemon(opts: SpawnDaemonOpts): number {
  mkdirSync(dirname(opts.pidFile), { recursive: true });
  mkdirSync(dirname(opts.logFile), { recursive: true });
  const logFd = openSync(opts.logFile, "a");
  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd,
    env: opts.env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  };
  const child = spawn(opts.cmd, opts.args, spawnOpts);
  if (!child.pid) {
    throw new Error(`failed to spawn ${opts.cmd}`);
  }
  child.unref();
  writePidFile(opts.pidFile, child.pid);
  return child.pid;
}

export async function waitForHealth(
  url: string,
  timeoutMs = 30_000,
  intervalMs = 400,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`health check timed out for ${url} (${lastErr})`);
}
