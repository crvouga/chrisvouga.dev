import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applyEnvFile } from "./env.ts";
import { ENV_FILE, LOCAL_BASE_URL, ROOT, dataDirFromEnvFile, resolveDataDir } from "./paths.ts";
import { ensureAppSecrets } from "./secrets.ts";

export type CookieJar = Map<string, string>;

const CLI_TOKEN_HEADER = "x-9r-cli-token";
const CLI_TOKEN_SALT = "9r-cli-auth";
const FETCH_TIMEOUT_MS = 30_000;

function logClient(msg: string): void {
  console.log(`[sync-cursor] ${msg}`);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function resolveBaseUrl(): string {
  applyEnvFile(ENV_FILE);
  const fromEnv =
    process.env.BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    LOCAL_BASE_URL;
  return fromEnv.replace(/\/$/, "");
}

/** Candidate DATA_DIR roots where 9Router may have written machine-id / cli-secret. */
export function candidateDataDirs(): string[] {
  const dirs: string[] = [];
  const add = (d?: string) => {
    if (!d) return;
    const resolved = d.startsWith("/") ? d : resolveDataDir(d);
    if (!dirs.includes(resolved)) dirs.push(resolved);
  };
  // Project .env wins over ambient shell DATA_DIR
  add(dataDirFromEnvFile());
  add(join(ROOT, "data"));
  add(join(homedir(), ".9router"));
  return dirs;
}

/**
 * Compute x-9r-cli-token the same way as upstream CLI / dashboardGuard.
 * Prefers reading the server-written machine-id + auth/cli-secret.
 */
export function computeCliToken(dataDir: string): string | null {
  const machineIdPath = join(dataDir, "machine-id");
  const cliSecretPath = join(dataDir, "auth", "cli-secret");
  if (!existsSync(machineIdPath) || !existsSync(cliSecretPath)) return null;
  const raw = readFileSync(machineIdPath, "utf8").trim();
  const secret = readFileSync(cliSecretPath, "utf8").trim();
  if (!raw || !secret) return null;
  return createHash("sha256")
    .update(raw + CLI_TOKEN_SALT + secret)
    .digest("hex")
    .substring(0, 16);
}

export function findCliToken(): { token: string; dataDir: string } | null {
  for (const dir of candidateDataDirs()) {
    const token = computeCliToken(dir);
    if (token) return { token, dataDir: dir };
  }
  return null;
}

function ingestSetCookies(res: Response, jar: CookieJar): void {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const cookies =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : (() => {
        const single = res.headers.get("set-cookie");
        return single ? [single] : [];
      })();

  for (const raw of cookies) {
    const pair = raw.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader(jar: CookieJar): string | undefined {
  if (jar.size === 0) return undefined;
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export type ClientOptions = {
  baseUrl: string;
  jar?: CookieJar;
  cliToken?: string | null;
};

export class NineRouterClient {
  readonly baseUrl: string;
  readonly jar: CookieJar;
  cliToken: string | null;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.jar = opts.jar ?? new Map();
    this.cliToken = opts.cliToken ?? null;
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = cookieHeader(this.jar);
    if (cookie) headers.set("cookie", cookie);
    if (this.cliToken) headers.set(CLI_TOKEN_HEADER, this.cliToken);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const signal =
      init.signal ??
      AbortSignal.timeout(FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(
          `9Router at ${this.baseUrl} did not respond within ${FETCH_TIMEOUT_MS / 1000}s — is it running? (npm start → Daemons: Start)`,
        );
      }
      throw err;
    }
    ingestSetCookies(res, this.jar);
    return res;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetch(path, init);
    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(
        `${init.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 200)}`,
        res.status,
        text,
      );
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  async health(): Promise<void> {
    let res: Response;
    try {
      res = await this.fetch("/api/health");
    } catch (err) {
      throw new Error(
        `9Router is not reachable at ${this.baseUrl}. Start it with: npm start → Daemons: Start\n${String(err)}`,
      );
    }
    if (!res.ok) {
      throw new Error(
        `9Router health check failed at ${this.baseUrl} (${res.status}). Start it with: npm start → Daemons: Start`,
      );
    }
  }

  async login(password: string): Promise<void> {
    const res = await this.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(
        `Login failed (${res.status}): ${text.slice(0, 200)}`,
        res.status,
        text,
      );
    }
    if (!this.jar.has("auth_token")) {
      throw new Error(
        "Login succeeded but no auth_token cookie was returned. Is requireLogin / SSO blocking password login?",
      );
    }
  }

  /** Probe whether dashboard APIs accept the current auth (CLI token and/or cookie). */
  async isAuthorized(): Promise<boolean> {
    const res = await this.fetch("/api/combos");
    return res.ok;
  }
}

/**
 * Create a client with health check + auth.
 * Prefers local CLI token (x-9r-cli-token); falls back to INITIAL_PASSWORD login.
 */
export async function createAuthedClient(): Promise<NineRouterClient> {
  await ensureAppSecrets();
  applyEnvFile(ENV_FILE);
  const baseUrl = resolveBaseUrl();
  const found = findCliToken();
  logClient(`Connecting to ${baseUrl}…`);
  const client = new NineRouterClient({
    baseUrl,
    cliToken: found?.token ?? null,
  });

  logClient("Health check GET /api/health…");
  await client.health();

  if (client.cliToken) {
    logClient(`Auth: probing CLI token from ${found!.dataDir}…`);
    if (await client.isAuthorized()) {
      logClient("Auth OK (CLI token)");
      return client;
    }
    logClient("Auth: CLI token rejected");
  } else {
    logClient(
      `Auth: no CLI token under ${candidateDataDirs().join(", ")}`,
    );
  }

  const password = process.env.INITIAL_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      [
        "Could not auth to 9Router dashboard API.",
        found
          ? `CLI token from ${found.dataDir} was rejected.`
          : `No machine-id/cli-secret found under: ${candidateDataDirs().join(", ")}`,
        `Set DATA_DIR in ${ENV_FILE} to the running instance, or fetch secrets:`,
        "  npm start → Secrets: Pull",
        "  vault run -- npm start",
      ].join("\n"),
    );
  }

  logClient("Auth: password login POST /api/auth/login…");
  await client.login(password);
  logClient("Auth probe GET /api/combos…");
  if (!(await client.isAuthorized())) {
    throw new Error("Login succeeded but /api/combos still unauthorized");
  }
  logClient("Auth OK (password login)");
  return client;
}
