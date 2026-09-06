import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureCloudflared, resolveCloudflaredBin } from "../../scripts/lib/cloudflared.ts";
import { applyEnvFile, loadEnvFile } from "../../scripts/lib/env.ts";
import {
  livePidFromFile,
  pidsOnPort,
  spawnDaemon,
  stopDaemon,
  stopPortOccupants,
  waitForHealth,
} from "../../scripts/lib/lifecycle.ts";
import {
  APP_DIR,
  APP_LOG_FILE,
  APP_PID_FILE,
  CLOUDFLARED_CONFIG,
  CURSOR_PUBLIC_BASE_URL,
  CURSOR_PUBLIC_HOST,
  ENV_FILE,
  LOCAL_BASE_URL,
  PID_DIR,
  ROOT,
  SECRET_KEYS,
  TUNNEL_LOG_FILE,
  TUNNEL_PID_FILE,
  dataDirFromEnvFile,
} from "../../scripts/lib/paths.ts";
import { ensureAppSecrets } from "../../scripts/lib/secrets.ts";
import { requireCmd } from "../../scripts/lib/spawn.ts";
import { CommandError, type Command } from "../types.ts";

function printAlreadyRunning(port: string): void {
  const appPid = livePidFromFile(APP_PID_FILE);
  const tunnelPid = livePidFromFile(TUNNEL_PID_FILE);
  console.log("Already running.");
  console.log(
    `  9router: ${appPid ? `pid ${appPid}` : "not running"} → http://127.0.0.1:${port}`,
  );
  console.log(
    `  tunnel:  ${tunnelPid ? `pid ${tunnelPid}` : "not running"} → ${CURSOR_PUBLIC_BASE_URL}`,
  );
  console.log(`  logs:    ${APP_LOG_FILE}`);
  console.log(`           ${TUNNEL_LOG_FILE}`);
  console.log("  Use Daemons: Status or Daemons: Stop from the menu.");
}

export async function startDaemons(): Promise<void> {
  requireCmd("node");

  if (!existsSync(ENV_FILE)) {
    console.log(`==> No ${ENV_FILE} — fetching secrets from Vault…`);
    await ensureAppSecrets({ writeEnv: true });
  }

  if (!existsSync(ENV_FILE)) {
    throw new CommandError(`Missing ${ENV_FILE}. Run Secrets: Pull first.`);
  }
  if (!existsSync(join(APP_DIR, "package.json"))) {
    throw new CommandError(
      "App not cloned. Run Setup: Full (or App: Sync → App: Install deps → App: Build).",
    );
  }
  if (!existsSync(join(APP_DIR, ".next", "BUILD_ID"))) {
    throw new CommandError(
      "App not built (missing .next/BUILD_ID). Run App: Build first.",
    );
  }
  if (!existsSync(CLOUDFLARED_CONFIG)) {
    throw new CommandError(
      [
        `Missing ${CLOUDFLARED_CONFIG}`,
        "Run Tunnel: Provision once first.",
        "(requires: brew install cloudflared && cloudflared tunnel login)",
      ].join("\n"),
    );
  }

  ensureCloudflared();
  mkdirSync(join(ROOT, "data"), { recursive: true });
  mkdirSync(PID_DIR, { recursive: true });

  const fileEnv = loadEnvFile(ENV_FILE);
  applyEnvFile(ENV_FILE);
  await ensureAppSecrets();

  const port = fileEnv.PORT?.trim() || process.env.PORT?.trim() || "20128";
  const hostname =
    fileEnv.HOSTNAME?.trim() || process.env.HOSTNAME?.trim() || "0.0.0.0";
  const nodeEnv =
    fileEnv.NODE_ENV?.trim() || process.env.NODE_ENV?.trim() || "production";
  const dataDir = dataDirFromEnvFile();
  const baseUrl =
    fileEnv.BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    LOCAL_BASE_URL;
  const nextPublic =
    fileEnv.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    baseUrl;
  const cookieSecure =
    fileEnv.AUTH_COOKIE_SECURE?.trim() ||
    process.env.AUTH_COOKIE_SECURE?.trim() ||
    "false";

  for (const key of SECRET_KEYS) {
    if (!process.env[key]?.trim()) {
      throw new CommandError(`${key} is empty in .env. Run Secrets: Pull.`);
    }
  }

  const appAlive = livePidFromFile(APP_PID_FILE);
  const tunnelAlive = livePidFromFile(TUNNEL_PID_FILE);
  if (appAlive && tunnelAlive) {
    printAlreadyRunning(port);
    return;
  }

  if (appAlive || tunnelAlive) {
    console.log("Partial daemon state — restarting…");
    stopDaemon(TUNNEL_PID_FILE, "tunnel");
    stopDaemon(APP_PID_FILE, "9router");
  }

  const portPids = pidsOnPort(port);
  if (portPids.length > 0) {
    throw new CommandError(
      [
        `Port ${port} is already in use (pid ${portPids.join(", ")})`,
        "Run Daemons: Stop first.",
      ].join("\n"),
    );
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: port,
    HOSTNAME: hostname,
    NODE_ENV: nodeEnv,
    DATA_DIR: dataDir,
    NEXT_PUBLIC_BASE_URL: nextPublic,
    BASE_URL: baseUrl,
    AUTH_COOKIE_SECURE: cookieSecure,
  };

  console.log(`==> Starting 9router daemon on ${hostname}:${port}`);
  console.log(`    DATA_DIR=${dataDir}`);
  const appPid = spawnDaemon({
    cmd: "node",
    args: ["custom-server.js", "--port", port, "--hostname", hostname],
    cwd: APP_DIR,
    env,
    pidFile: APP_PID_FILE,
    logFile: APP_LOG_FILE,
  });
  console.log(`    pid ${appPid}  log ${APP_LOG_FILE}`);

  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  try {
    console.log(`==> Waiting for ${healthUrl}…`);
    await waitForHealth(healthUrl);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error(`See log: ${APP_LOG_FILE}`);
    stopDaemon(APP_PID_FILE, "9router");
    throw new CommandError("9router failed health check.");
  }
  console.log("    health OK");

  const cloudflared = resolveCloudflaredBin();
  console.log(`==> Starting tunnel daemon → ${CURSOR_PUBLIC_HOST}`);
  const tunnelPid = spawnDaemon({
    cmd: cloudflared,
    args: ["tunnel", "--config", CLOUDFLARED_CONFIG, "run"],
    cwd: ROOT,
    env: process.env,
    pidFile: TUNNEL_PID_FILE,
    logFile: TUNNEL_LOG_FILE,
  });
  console.log(`    pid ${tunnelPid}  log ${TUNNEL_LOG_FILE}`);

  await new Promise((r) => setTimeout(r, 800));
  if (!livePidFromFile(TUNNEL_PID_FILE)) {
    console.error(`See log: ${TUNNEL_LOG_FILE}`);
    stopDaemon(APP_PID_FILE, "9router");
    throw new CommandError("Tunnel exited immediately.");
  }

  console.log("");
  console.log("OK — daemons running.");
  console.log(`  local:  http://127.0.0.1:${port}`);
  console.log(`  public: ${CURSOR_PUBLIC_BASE_URL}`);
  console.log(`  Cursor: ${CURSOR_PUBLIC_BASE_URL}/v1`);
}

export async function stopDaemons(): Promise<void> {
  const fileEnv = loadEnvFile(ENV_FILE);
  applyEnvFile(ENV_FILE);
  const port = fileEnv.PORT?.trim() || process.env.PORT?.trim() || "20128";

  let stopped = false;
  if (stopDaemon(TUNNEL_PID_FILE, "tunnel")) stopped = true;
  if (stopDaemon(APP_PID_FILE, "9router")) stopped = true;
  if (stopPortOccupants(port)) stopped = true;

  if (!stopped) {
    console.log(
      `nothing to stop (no daemons under ${PID_DIR}, port :${port} free)`,
    );
  } else {
    console.log("down complete");
  }
}

function tunnelLocalService(): string | null {
  if (!existsSync(CLOUDFLARED_CONFIG)) return null;
  const text = readFileSync(CLOUDFLARED_CONFIG, "utf8");
  const match = text.match(/^\s*service:\s*(https?:\/\/\S+)/m);
  return match?.[1]?.replace(/\/$/, "") ?? null;
}

function resolveLocalBase(fileEnv: Record<string, string>): string {
  return (
    tunnelLocalService() ||
    fileEnv.BASE_URL?.trim() ||
    fileEnv.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    LOCAL_BASE_URL
  ).replace(/\/$/, "");
}

export async function showStatus(): Promise<void> {
  const fileEnv = loadEnvFile(ENV_FILE);
  applyEnvFile(ENV_FILE);
  const port = fileEnv.PORT?.trim() || process.env.PORT?.trim() || "20128";
  const local = resolveLocalBase(fileEnv);

  const appPid = livePidFromFile(APP_PID_FILE);
  const tunnelPid = livePidFromFile(TUNNEL_PID_FILE);
  const listeners = pidsOnPort(port);

  console.log(
    `9router: ${appPid ? `running (pid ${appPid})` : "not running"}`,
  );
  console.log(
    `tunnel:  ${tunnelPid ? `running (pid ${tunnelPid})` : "not running"}`,
  );
  console.log(
    `port :${port}: ${
      listeners.length ? `LISTEN (pid ${listeners.join(", ")})` : "free"
    }`,
  );
  console.log(`local:   ${local}`);
  console.log(`public:  ${CURSOR_PUBLIC_BASE_URL}`);
  console.log(`logs:    ${APP_LOG_FILE}`);
  console.log(`         ${TUNNEL_LOG_FILE}`);
}

export const lifecycleCommands: Command[] = [
  {
    id: "start",
    name: "Daemons: Start",
    description: "Daemonize 9Router and the Cloudflare named tunnel",
    run: startDaemons,
  },
  {
    id: "stop",
    name: "Daemons: Stop",
    description: "Stop app and tunnel daemons; free the app port",
    run: stopDaemons,
  },
  {
    id: "status",
    name: "Daemons: Status",
    description: "Show pids, port listeners, local/public URLs, and log paths",
    run: showStatus,
  },
];
