import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();

export function which(cmd: string): string | null {
  assert.nonEmptyString(cmd, "command name must be non-empty");
  const result = spawnSync("which", [cmd], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const path = result.stdout.trim();
  return path || null;
}

export function requireCmd(cmd: string, hint?: string): string {
  assert.nonEmptyString(cmd, "command name must be non-empty");
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
  assert.nonEmptyString(cmd, "spawn command must be non-empty");
  assert.array(args, "spawn args must be an array", { cmd });
  for (const arg of args) {
    ha.string(arg, "spawn arg must be a string", { cmd });
  }
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
  assert.integer(status, "spawn exit status must be an integer", { cmd });
  return { status, stdout, stderr };
}

export function runInherit(
  cmd: string,
  args: readonly string[],
  opts: SpawnOptions & { readonly allowFail?: boolean } = {},
): number {
  assert.nonEmptyString(cmd, "spawn command must be non-empty");
  assert.array(args, "spawn args must be an array", { cmd });
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
  assert.nonEmptyString(cmd, "spawn command must be non-empty");
  assert.array(args, "spawn args must be an array", { cmd });
  return spawn(cmd, args, {
    stdio: "inherit",
    ...opts,
  });
}

export function assertPath(path: string, message: string): void {
  assert.nonEmptyString(path, "asserted path must be non-empty");
  assert.nonEmptyString(message, "assert message must be non-empty");
  if (!existsSync(path)) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
}
