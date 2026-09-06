import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
} from "node:crypto";
import { copyFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { ROOT } from "./paths.ts";

export const CURSOR_STATE_DB = join(
  homedir(),
  "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
);

export const APPLICATION_USER_KEY =
  "src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser";

export const OPENAI_KEY_SECRET = "secret://cursorAuth/openAIKey";

const SAFE_STORAGE_SERVICE = "Cursor Safe Storage";
const OSCYPT_SALT = Buffer.from("saltysalt");
const OSCYPT_IV = Buffer.alloc(16, 0x20);
const OSCYPT_ITERATIONS = 1003;
const V10_PREFIX = Buffer.from("v10");

export type ApplicationUser = {
  openAIBaseUrl?: string;
  useOpenAIKey?: boolean;
  aiSettings?: {
    userAddedModels?: string[];
    modelOverrideEnabled?: string[];
    modelOverrideDisabled?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function defaultCursorStateDb(): string {
  return process.env.CURSOR_STATE_DB?.trim() || CURSOR_STATE_DB;
}

/** True if any process (typically Cursor) has the DB open. */
export function isCursorHoldingDb(dbPath = defaultCursorStateDb()): boolean {
  if (!existsSync(dbPath)) return false;
  try {
    const out = execFileSync("lsof", ["-t", dbPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return false;
    const pids = out.split(/\s+/).filter(Boolean);
    // Ignore our own pid if somehow listed
    return pids.some((p) => Number(p) !== process.pid);
  } catch {
    // lsof exits 1 when nothing holds the file
    return false;
  }
}

export function assertCursorQuitOrForce(
  force: boolean,
  dbPath = defaultCursorStateDb(),
): void {
  if (!isCursorHoldingDb(dbPath)) return;
  if (force) {
    console.warn(
      "WARNING: Cursor appears to have state.vscdb open; writing with --force. Changes may be overwritten when Cursor quits.",
    );
    return;
  }
  throw new Error(
    "Cursor is using state.vscdb. Quit Cursor completely, then re-run.\n(Or pass --force to write anyway — not recommended.)",
  );
}

/** Human-readable file size for logs. */
export function formatDbSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function cursorStateDbSize(dbPath = defaultCursorStateDb()): number {
  if (!existsSync(dbPath)) {
    throw new Error(`Cursor state DB not found: ${dbPath}`);
  }
  return statSync(dbPath).size;
}

/** Full-file copy — avoid on large DBs; prefer backupCursorSyncState. */
export function backupStateDb(dbPath = defaultCursorStateDb()): string {
  if (!existsSync(dbPath)) {
    throw new Error(`Cursor state DB not found: ${dbPath}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${dbPath}.bak-9router-${stamp}`;
  copyFileSync(dbPath, dest);
  // Also copy WAL/SHM if present so backup is consistent
  for (const suffix of ["-wal", "-shm"]) {
    const side = `${dbPath}${suffix}`;
    if (existsSync(side)) copyFileSync(side, `${dest}${suffix}`);
  }
  return dest;
}

export type CursorSyncBackup = {
  dbPath: string;
  updatedAt: string;
  applicationUser: ApplicationUser;
  openAIKeySecret: string | null;
};

/** Backup only the ItemTable keys sync-cursor modifies (fast even for huge DBs). */
export function backupCursorSyncState(
  dbPath = defaultCursorStateDb(),
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(ROOT, `.cursor-sync-backup-${stamp}.json`);
  const payload: CursorSyncBackup = {
    dbPath,
    updatedAt: new Date().toISOString(),
    applicationUser: readApplicationUser(dbPath),
    openAIKeySecret: readOpenAIKeySecret(dbPath),
  };
  writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return dest;
}

function readItemTableValue(
  dbPath: string,
  key: string,
): string | null {
  const db = openDb(dbPath, true);
  try {
    const row = db
      .prepare("SELECT value FROM ItemTable WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } finally {
    db.close();
  }
}

function openDb(dbPath: string, readonly: boolean): DatabaseSync {
  if (!existsSync(dbPath)) {
    throw new Error(`Cursor state DB not found: ${dbPath}`);
  }
  const db = new DatabaseSync(dbPath, { readOnly: readonly });
  if (!readonly) {
    db.exec("PRAGMA busy_timeout = 5000");
  }
  return db;
}

export function readApplicationUser(
  dbPath = defaultCursorStateDb(),
): ApplicationUser {
  const value = readItemTableValue(dbPath, APPLICATION_USER_KEY);
  if (!value) {
    throw new Error(
      `Missing applicationUser blob in ${dbPath} (key ${APPLICATION_USER_KEY})`,
    );
  }
  return JSON.parse(value) as ApplicationUser;
}

export function readOpenAIKeySecret(
  dbPath = defaultCursorStateDb(),
): string | null {
  return readItemTableValue(dbPath, OPENAI_KEY_SECRET);
}

export function writeApplicationUser(
  user: ApplicationUser,
  dbPath = defaultCursorStateDb(),
): void {
  const db = openDb(dbPath, false);
  try {
    db.exec("BEGIN");
    db.prepare(
      "INSERT INTO ItemTable(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(APPLICATION_USER_KEY, JSON.stringify(user));
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    db.close();
  }
}

export function writeOpenAIKeySecret(
  encryptedV10: Buffer,
  dbPath = defaultCursorStateDb(),
): void {
  const payload = JSON.stringify({
    type: "Buffer",
    data: [...encryptedV10],
  });
  const db = openDb(dbPath, false);
  try {
    db.exec("BEGIN");
    db.prepare(
      "INSERT INTO ItemTable(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(OPENAI_KEY_SECRET, payload);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    db.close();
  }
}

/** Read Cursor Safe Storage password from macOS Keychain. */
export function getCursorSafeStoragePassword(): string {
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-w", "-s", SAFE_STORAGE_SERVICE],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (err) {
    throw new Error(
      `Could not read Keychain item "${SAFE_STORAGE_SERVICE}". Unlock Keychain / grant access, or paste the API key in Cursor Settings → Models.\n${String(err)}`,
    );
  }
}

function deriveOsCryptKey(password: string): Buffer {
  return pbkdf2Sync(password, OSCYPT_SALT, OSCYPT_ITERATIONS, 16, "sha1");
}

/** Encrypt plaintext for Electron safeStorage (Chromium OSCrypt v10). */
export function encryptOsCryptV10(plaintext: string, password: string): Buffer {
  const key = deriveOsCryptKey(password);
  const cipher = createCipheriv("aes-128-cbc", key, OSCYPT_IV);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  return Buffer.concat([V10_PREFIX, enc]);
}

/** Decrypt OSCrypt v10 blob (for round-trip checks). */
export function decryptOsCryptV10(blob: Buffer, password: string): string {
  if (!blob.subarray(0, 3).equals(V10_PREFIX)) {
    throw new Error("Not a v10 OSCrypt blob");
  }
  const key = deriveOsCryptKey(password);
  const decipher = createDecipheriv("aes-128-cbc", key, OSCYPT_IV);
  const dec = Buffer.concat([
    decipher.update(blob.subarray(3)),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export type PatchCursorModelsResult = {
  beforeBaseUrl?: string;
  afterBaseUrl: string;
  addedModels: string[];
  enabledModels: string[];
  prunedModels: string[];
};

const COMBO_PREFIX = "9router-";

/** Unprefixed alias for a catalog name (e.g. 9router-free → free). */
export function legacyUnprefixedAlias(name: string): string | null {
  if (!name.startsWith(COMBO_PREFIX)) return null;
  const rest = name.slice(COMBO_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

/**
 * Patch applicationUser for 9Router: base URL, useOpenAIKey, userAddedModels, overrides.
 * @param pruneCatalogNames names previously managed by sync; removed if not in comboNames
 */
export function patchApplicationUserForCombos(
  user: ApplicationUser,
  opts: {
    openAIBaseUrl: string;
    comboNames: string[];
    pruneCatalogNames?: string[];
  },
): { user: ApplicationUser; result: PatchCursorModelsResult } {
  const next: ApplicationUser = structuredClone(user);
  const beforeBaseUrl = next.openAIBaseUrl;
  next.openAIBaseUrl = opts.openAIBaseUrl;
  next.useOpenAIKey = true;

  const ai = { ...(next.aiSettings ?? {}) };
  const existing = Array.isArray(ai.userAddedModels)
    ? [...ai.userAddedModels]
    : [];
  const enabled = new Set(
    Array.isArray(ai.modelOverrideEnabled) ? ai.modelOverrideEnabled : [],
  );
  const disabled = new Set(
    Array.isArray(ai.modelOverrideDisabled) ? ai.modelOverrideDisabled : [],
  );

  const addedModels: string[] = [];
  for (const name of opts.comboNames) {
    if (!existing.includes(name)) {
      existing.push(name);
      addedModels.push(name);
    }
    enabled.add(name);
    disabled.delete(name);
  }

  const prunedModels: string[] = [];
  const removeName = (n: string) => {
    const idx = existing.indexOf(n);
    if (idx >= 0) {
      existing.splice(idx, 1);
      prunedModels.push(n);
    }
    enabled.delete(n);
    disabled.delete(n);
  };

  // Drop legacy unprefixed aliases (free when syncing 9router-free, etc.)
  for (const name of opts.comboNames) {
    const legacy = legacyUnprefixedAlias(name);
    if (legacy) removeName(legacy);
  }

  if (opts.pruneCatalogNames?.length) {
    const keep = new Set(opts.comboNames);
    const catalog = new Set(opts.pruneCatalogNames);
    for (let i = existing.length - 1; i >= 0; i--) {
      const n = existing[i]!;
      if (catalog.has(n) && !keep.has(n)) {
        existing.splice(i, 1);
        enabled.delete(n);
        prunedModels.push(n);
      }
    }
  }

  ai.userAddedModels = existing;
  ai.modelOverrideEnabled = [...enabled];
  ai.modelOverrideDisabled = [...disabled];
  next.aiSettings = ai;

  return {
    user: next,
    result: {
      beforeBaseUrl,
      afterBaseUrl: opts.openAIBaseUrl,
      addedModels,
      enabledModels: opts.comboNames,
      prunedModels,
    },
  };
}

export function openAIBaseUrlFromRouter(baseUrl: string): string {
  const root = baseUrl.replace(/\/$/, "");
  return root.endsWith("/v1") ? root : `${root}/v1`;
}

/** True if hostname is loopback or RFC1918 / link-local (Cursor SSRF blocks these). */
export function isPrivateOpenAIBaseUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return true;
  }
  // IPv4 literal
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 0) return true;
  }
  return false;
}
