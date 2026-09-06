import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PID_DIR } from "../scripts/lib/paths.ts";

const HISTORY_FILE = join(PID_DIR, "cli-history.json");
const MAX_HISTORY = 15;

type HistoryFile = {
  ids: string[];
};

export function loadHistory(): string[] {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(HISTORY_FILE, "utf8")) as HistoryFile;
    return Array.isArray(raw.ids)
      ? raw.ids.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function pushHistory(id: string): void {
  if (id === "exit") return;
  const prev = loadHistory().filter((x) => x !== id);
  const next = [id, ...prev].slice(0, MAX_HISTORY);
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(
    HISTORY_FILE,
    `${JSON.stringify({ ids: next, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    { mode: 0o600 },
  );
}
