import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { ENV_EXAMPLE, ENV_FILE } from "./paths.ts";

/** Parse a simple KEY=VALUE .env file (no export, no multiline). */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnvFile(path = ENV_FILE): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf8"));
}

/** Ensure .env exists (copy from example if needed). */
export function ensureEnvFile(): void {
  if (existsSync(ENV_FILE)) return;
  if (existsSync(ENV_EXAMPLE)) {
    copyFileSync(ENV_EXAMPLE, ENV_FILE);
    chmodSync(ENV_FILE, 0o600);
    console.log(`Created ${ENV_FILE} from .env.example`);
    return;
  }
  writeFileSync(ENV_FILE, "", { mode: 0o600 });
}

/** Upsert KEY=value in .env (preserves other lines). */
export function upsertEnv(key: string, value: string, path = ENV_FILE): void {
  ensureEnvFile();
  const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const prefix = `${key}=`;
  let found = false;
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      out.push(`${key}=${value}`);
      found = true;
    } else if (line.length > 0 || out.length === 0 || out[out.length - 1] !== "") {
      // keep blank lines except trailing empties handled below
      out.push(line);
    }
  }
  // Drop a single trailing empty line from split, then ensure we append if needed
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  if (!found) out.push(`${key}=${value}`);
  writeFileSync(path, `${out.join("\n")}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort
  }
}

/** Load .env into process.env without overriding already-set vars. */
export function applyEnvFile(path = ENV_FILE): void {
  const data = loadEnvFile(path);
  for (const [k, v] of Object.entries(data)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
