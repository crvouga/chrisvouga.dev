import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";

export function which(cmd: string): string | null {
  const result = spawnSync("which", [cmd], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const path = result.stdout.trim();
  return path || null;
}

export function requireCmd(cmd: string, hint?: string): string {
  const path = which(cmd);
  if (!path) {
    console.error(`ERROR: missing command: ${cmd}`);
    if (hint) console.error(`  ${hint}`);
    process.exit(1);
  }
  return path;
}

export type RunResult = {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

export function run(
  cmd: string,
  args: readonly string[],
  opts: SpawnOptions & { readonly allowFail?: boolean } = {},
): RunResult {
  const { allowFail, ...spawnOpts } = opts;
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    ...spawnOpts,
  });
  const status = result.status ?? 1;
  const stdout = result.stdout?.toString() ?? "";
  const stderr = result.stderr?.toString() ?? "";
  if (status !== 0 && !allowFail) {
    const detail = (stderr || stdout).trim();
    throw new Error(
      `${cmd} ${args.join(" ")} failed (exit ${status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return { status, stdout, stderr };
}

export function runInherit(
  cmd: string,
  args: readonly string[],
  opts: SpawnOptions & { readonly allowFail?: boolean } = {},
): number {
  const { allowFail, ...spawnOpts } = opts;
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    ...spawnOpts,
  });
  const status = result.status ?? 1;
  if (status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${status})`);
  }
  return status;
}

/** Spawn a long-running process; returns ChildProcess. */
export function spawnDetached(
  cmd: string,
  args: readonly string[],
  opts: SpawnOptions = {},
) {
  return spawn(cmd, args, {
    stdio: "inherit",
    ...opts,
  });
}

export function assertPath(path: string, message: string): void {
  if (!existsSync(path)) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
}
