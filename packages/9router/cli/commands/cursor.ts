import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAuthedClient } from "../../scripts/lib/client.ts";
import {
  formatMaterializeReport,
  materializeCombosSpec,
} from "../../scripts/lib/combo-materialize.ts";
import { loadCombosSpec } from "../../scripts/lib/combos.ts";
import {
  assertCursorQuitOrForce,
  backupCursorSyncState,
  cursorStateDbSize,
  decryptOsCryptV10,
  defaultCursorStateDb,
  encryptOsCryptV10,
  formatDbSize,
  getCursorSafeStoragePassword,
  isCursorHoldingDb,
  isPrivateOpenAIBaseUrl,
  openAIBaseUrlFromRouter,
  patchApplicationUserForCombos,
  readApplicationUser,
  writeApplicationUser,
  writeOpenAIKeySecret,
} from "../../scripts/lib/cursor.ts";
import { CURSOR_PUBLIC_BASE_URL, ROOT } from "../../scripts/lib/paths.ts";
import {
  activeProviderIds,
  fetchProviderConnections,
  loadProviderIndex,
} from "../../scripts/lib/registry.ts";
import { askConfirm, askInput, askSelect } from "../prompt.ts";
import { CommandError, type Command } from "../types.ts";

type ApiKeyRow = {
  id: string;
  key: string;
  name: string;
  isActive?: boolean;
};

const SYNCED_COMBOS_FILE = join(ROOT, ".cursor-synced-combos.json");

function logStep(msg: string): void {
  console.log(`[sync-cursor] ${msg}`);
}

function resolveCursorOpenAIBaseUrl(cliBaseUrl?: string): {
  raw: string;
  source: string;
} {
  if (cliBaseUrl?.trim()) {
    return { raw: cliBaseUrl.trim(), source: "prompt" };
  }
  const fromEnv = process.env.CURSOR_OPENAI_BASE_URL?.trim();
  if (fromEnv) {
    return { raw: fromEnv, source: "CURSOR_OPENAI_BASE_URL" };
  }
  return {
    raw: CURSOR_PUBLIC_BASE_URL,
    source: "CURSOR_PUBLIC_BASE_URL",
  };
}

function assertPublicOrAllowed(
  openAIBaseUrl: string,
  allowPrivate: boolean,
  source: string,
): void {
  if (!isPrivateOpenAIBaseUrl(openAIBaseUrl)) return;
  if (allowPrivate) {
    console.warn(
      `[sync-cursor] WARNING: writing private base URL (${openAIBaseUrl}). Cursor Agent/Chat will fail with "Access to private networks is forbidden".`,
    );
    return;
  }
  throw new CommandError(
    [
      `Refusing to sync private OpenAI base URL: ${openAIBaseUrl}`,
      `(source: ${source})`,
      "",
      "Cursor's cloud backend blocks loopback/RFC1918 addresses (SSRF protection).",
      "Use the stable public hostname:",
      "",
      "  Tunnel: Provision (once)",
      "  Daemons: Start (app + tunnel → 9router.chrisvouga.dev)",
      "  Cursor: Sync (writes https://9router.chrisvouga.dev/v1)",
      "",
      "Allow private base URL only if you intentionally want localhost (will not work in Agent).",
    ].join("\n"),
  );
}

function readLastSyncedCombos(): string[] {
  if (!existsSync(SYNCED_COMBOS_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(SYNCED_COMBOS_FILE, "utf8")) as {
      names?: string[];
    };
    return Array.isArray(raw.names) ? raw.names.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeLastSyncedCombos(names: string[]): void {
  writeFileSync(
    SYNCED_COMBOS_FILE,
    `${JSON.stringify({ names, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function ensureCursorApiKey(
  client: Awaited<ReturnType<typeof createAuthedClient>>,
  keyName: string,
): Promise<{ key: string; created: boolean }> {
  logStep("GET /api/keys…");
  const data = await client.json<{ keys: ApiKeyRow[] }>("/api/keys");
  const existing = (data.keys ?? []).find(
    (k) => k.name === keyName && k.isActive !== false && k.key,
  );
  if (existing?.key) {
    return { key: existing.key, created: false };
  }
  logStep(`POST /api/keys (create "${keyName}")…`);
  const created = await client.json<ApiKeyRow>("/api/keys", {
    method: "POST",
    body: JSON.stringify({ name: keyName }),
  });
  if (!created?.key) {
    throw new CommandError(
      `Failed to create 9Router API key named "${keyName}"`,
    );
  }
  return { key: created.key, created: true };
}

export async function syncCursor(): Promise<void> {
  const dryRun = await askConfirm(
    "Dry run only?",
    "Show planned Cursor changes without writing state.vscdb.",
    false,
  );
  const force = await askConfirm(
    "Force write while Cursor may be open?",
    "Write even if Cursor holds the DB open (changes may be overwritten).",
    false,
  );
  const pruneCombos = await askConfirm(
    "Prune removed combo names?",
    "Drop previously synced combo model names that are no longer in combos.yaml.",
    false,
  );

  const baseChoice = await askSelect<"default" | "env" | "custom">({
    message: "OpenAI base URL",
    description:
      "Cursor Agent calls this URL from the cloud — use the public tunnel hostname.",
    choices: [
      {
        name: `Public tunnel (${CURSOR_PUBLIC_BASE_URL})`,
        value: "default",
        description: "Recommended for Cursor BYOK",
      },
      {
        name: "CURSOR_OPENAI_BASE_URL from environment",
        value: "env",
        description: process.env.CURSOR_OPENAI_BASE_URL?.trim()
          ? `Currently: ${process.env.CURSOR_OPENAI_BASE_URL.trim()}`
          : "Not set — falls back to public tunnel",
      },
      {
        name: "Custom URL",
        value: "custom",
        description: "Enter a full https:// base URL",
      },
    ],
    default: "default",
  });

  let baseUrl: string | undefined;
  if (baseChoice === "custom") {
    baseUrl = await askInput({
      message: "Custom OpenAI base URL",
      description: "Usually https://9router.chrisvouga.dev (no /v1 suffix needed).",
      default: CURSOR_PUBLIC_BASE_URL,
      validate: (v) => {
        try {
          const u = new URL(v.trim());
          if (!u.protocol.startsWith("http")) return "Must be http(s)";
          return true;
        } catch {
          return "Enter a valid URL";
        }
      },
    });
  } else if (baseChoice === "env") {
    baseUrl = process.env.CURSOR_OPENAI_BASE_URL?.trim() || undefined;
  }

  const allowPrivate = await askConfirm(
    "Allow private / localhost base URL?",
    "Cursor Agent will 403 private networks. Only enable for local debugging.",
    false,
  );

  const dbPath = defaultCursorStateDb();
  const keyName =
    process.env.NINEROUTER_CURSOR_KEY_NAME?.trim() || "cursor";

  logStep(
    `Starting (dryRun=${dryRun} force=${force} pruneCombos=${pruneCombos} allowPrivate=${allowPrivate})`,
  );

  logStep(`Cursor DB: ${dbPath}`);
  const dbBytes = cursorStateDbSize(dbPath);
  logStep(
    `Cursor DB size: ${formatDbSize(dbBytes)} (row-level backup only, not full copy)`,
  );

  logStep("Checking Cursor DB lock via lsof…");
  if (!dryRun) {
    try {
      assertCursorQuitOrForce(force, dbPath);
    } catch (err) {
      throw new CommandError(
        err instanceof Error ? err.message : String(err),
      );
    }
    logStep("Cursor DB not locked by another process");
  } else if (isCursorHoldingDb(dbPath)) {
    console.warn(
      "[sync-cursor] NOTE: Cursor has state.vscdb open (dry-run only; quit Cursor before a real sync).",
    );
  } else {
    logStep("Cursor DB not locked by another process");
  }

  logStep("Loading combos.yaml templates + connected providers…");
  const template = loadCombosSpec();
  const index = await loadProviderIndex();
  const clientForCombos = await createAuthedClient();
  const connections = await fetchProviderConnections(clientForCombos);
  const active = activeProviderIds(connections, index);
  const materialized = materializeCombosSpec(template, active, index);
  console.log(`==> ${formatMaterializeReport(materialized).split("\n").join("\n    ")}`);

  const comboNames = materialized.spec.combos.map((c) => c.name);
  if (comboNames.length === 0) {
    throw new CommandError(
      "No materialized combos — connect providers and Combos: Sync first.",
    );
  }

  const { raw, source } = resolveCursorOpenAIBaseUrl(baseUrl);
  const openAIBaseUrl = openAIBaseUrlFromRouter(raw);
  assertPublicOrAllowed(openAIBaseUrl, allowPrivate, source);
  const lastSynced = readLastSyncedCombos();
  logStep(`Loaded ${comboNames.length} materialized combos`);

  console.log(`==> 9Router OpenAI base: ${openAIBaseUrl} (from ${source})`);
  console.log(`==> Combos: ${comboNames.join(", ")}`);

  let apiKey = "";
  let keyCreated = false;
  if (!dryRun) {
    const ensured = await ensureCursorApiKey(clientForCombos, keyName);
    apiKey = ensured.key;
    keyCreated = ensured.created;
    console.log(
      keyCreated
        ? `==> Created 9Router API key "${keyName}"`
        : `==> Reusing 9Router API key "${keyName}"`,
    );
  } else {
    console.log(`==> (dry-run) would ensure 9Router API key "${keyName}"`);
  }

  logStep("Reading applicationUser from SQLite…");
  const before = readApplicationUser(dbPath);
  logStep("Computing patch…");
  const { user: patched, result } = patchApplicationUserForCombos(before, {
    openAIBaseUrl,
    comboNames,
    pruneCatalogNames: pruneCombos
      ? [...new Set([...lastSynced, ...comboNames])]
      : undefined,
  });

  console.log(
    `  base URL: ${result.beforeBaseUrl ?? "(unset)"} → ${result.afterBaseUrl}`,
  );
  console.log(
    result.addedModels.length
      ? `  + models: ${result.addedModels.join(", ")}`
      : "  models: already present",
  );
  if (result.prunedModels.length) {
    console.log(`  - pruned: ${result.prunedModels.join(", ")}`);
  }

  if (dryRun) {
    console.log("Dry run — no changes written.");
    return;
  }

  logStep("Backing up 2 ItemTable keys…");
  const backup = backupCursorSyncState(dbPath);
  console.log(`==> Backup: ${backup}`);

  logStep("Writing applicationUser…");
  writeApplicationUser(patched, dbPath);

  let keyWritten = false;
  try {
    logStep("Reading Cursor Safe Storage from Keychain…");
    const password = getCursorSafeStoragePassword();
    logStep("Encrypting API key (OSCrypt v10)…");
    const encrypted = encryptOsCryptV10(apiKey, password);
    if (decryptOsCryptV10(encrypted, password) !== apiKey) {
      throw new Error("OSCrypt round-trip mismatch");
    }
    logStep("Writing openAIKey secret…");
    writeOpenAIKeySecret(encrypted, dbPath);
    keyWritten = true;
    console.log(
      "==> Wrote encrypted OpenAI API key (secret://cursorAuth/openAIKey)",
    );
  } catch (err) {
    console.warn(
      `WARNING: Could not write encrypted API key into Cursor storage:\n${err instanceof Error ? err.message : err}`,
    );
    console.warn(
      `\nPaste this key manually in Cursor Settings → Models → OpenAI API Key:\n  ${apiKey}\n`,
    );
  }

  logStep("Writing .cursor-synced-combos.json…");
  writeLastSyncedCombos(comboNames);

  console.log(
    [
      "OK — Cursor config updated.",
      keyWritten
        ? "Reopen Cursor (or Reload Window), then pick a combo model (e.g. 9router-free, 9router-max-sub-claude)."
        : "Reopen Cursor, paste the API key above if prompted, then pick a combo model.",
      `Keep daemons up (Daemons: Start) so ${CURSOR_PUBLIC_BASE_URL} reaches local 9Router.`,
    ].join("\n"),
  );
}

export const cursorCommands: Command[] = [
  {
    id: "sync-cursor",
    name: "Cursor: Sync",
    description:
      "Write BYOK base URL, API key, and materialized combo models into Cursor state.vscdb",
    run: syncCursor,
  },
];
