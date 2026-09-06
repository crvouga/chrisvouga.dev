import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CLOUDFLARED_HOME = join(homedir(), ".cloudflared");
export const CLOUDFLARED_CERT = join(CLOUDFLARED_HOME, "cert.pem");

let cachedBin: string | null | undefined;

function candidateBins(): string[] {
  const out: string[] = [];
  const add = (p?: string) => {
    if (!p || out.includes(p)) return;
    out.push(p);
  };
  add(process.env.CLOUDFLARED_BIN?.trim());
  // Prefer Homebrew Mach-O before PATH — ~/.local/bin often has a Linux ELF that ENOEXECs on macOS
  add("/opt/homebrew/bin/cloudflared");
  add("/opt/homebrew/opt/cloudflared/bin/cloudflared");
  add("/usr/local/bin/cloudflared");
  const which = spawnSync("which", ["-a", "cloudflared"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (which.status === 0 && which.stdout) {
    for (const line of which.stdout.split(/\r?\n/)) {
      add(line.trim());
    }
  }
  add("cloudflared");
  return out;
}

function probeBin(bin: string): boolean {
  const probe = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.error || probe.status !== 0) return false;
  const text = `${probe.stderr ?? ""}${probe.error?.message ?? ""}`;
  if (/exec format error|bad CPU type|cannot execute/i.test(text)) return false;
  return true;
}

/** Absolute path (or `cloudflared`) to a runnable binary. */
export function resolveCloudflaredBin(): string {
  if (cachedBin !== undefined) {
    if (cachedBin === null) {
      throw new Error("cloudflared not runnable (cached)");
    }
    return cachedBin;
  }

  const tried: string[] = [];
  for (const bin of candidateBins()) {
    if (bin !== "cloudflared" && !existsSync(bin)) continue;
    tried.push(bin);
    if (probeBin(bin)) {
      if (bin !== "cloudflared" && bin.includes("/")) {
        const pathFirst = spawnSync("which", ["cloudflared"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
          .stdout?.trim();
        if (pathFirst && pathFirst !== bin) {
          console.warn(
            `[cloudflared] Using ${bin} (PATH has broken ${pathFirst}; remove it or put Homebrew first)`,
          );
        }
      }
      cachedBin = bin;
      return bin;
    }
  }

  cachedBin = null;
  console.error(
    [
      "cloudflared is missing or not runnable on this machine.",
      `Tried: ${tried.join(", ") || "(none)"}`,
      "Install: brew install cloudflared",
      "If brew says PATH is shadowed, remove the broken binary, e.g.:",
      "  rm ~/\\.local/bin/cloudflared",
      "Or set CLOUDFLARED_BIN=/opt/homebrew/bin/cloudflared",
    ].join("\n"),
  );
  process.exit(1);
}

export function ensureCloudflared(): void {
  resolveCloudflaredBin();
}

export function ensureCloudflaredCert(): void {
  if (existsSync(CLOUDFLARED_CERT)) return;
  console.error(
    [
      `Missing Cloudflare tunnel cert: ${CLOUDFLARED_CERT}`,
      "Run once (opens browser):",
      "  cloudflared tunnel login",
      "Then re-run: npm start → Tunnel: Provision",
    ].join("\n"),
  );
  process.exit(1);
}

export function cloudflared(
  args: string[],
  opts?: { inheritStdio?: boolean },
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const bin = resolveCloudflaredBin();
  const inherit = opts?.inheritStdio === true;
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function spawnCloudflared(
  args: string[],
  opts?: { stdio?: "inherit" | "pipe" },
): ChildProcess {
  const bin = resolveCloudflaredBin();
  return spawn(bin, args, {
    stdio: opts?.stdio ?? "inherit",
  });
}

/** List named tunnels: Map name → uuid */
export function listTunnels(): Map<string, string> {
  const { status, stdout, stderr } = cloudflared(["tunnel", "list"]);
  if (status !== 0) {
    throw new Error(
      `cloudflared tunnel list failed:\n${stderr || stdout || `exit ${status}`}`,
    );
  }
  const map = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    // ID (uuid) then NAME …
    const m =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+(\S+)/i.exec(
        line.trim(),
      );
    if (m) map.set(m[2]!, m[1]!);
  }
  return map;
}

export function credentialsPathForTunnel(tunnelId: string): string {
  return join(CLOUDFLARED_HOME, `${tunnelId}.json`);
}
