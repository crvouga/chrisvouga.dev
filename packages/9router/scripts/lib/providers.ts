import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { spawn } from "node:child_process";
import type { NineRouterClient } from "./client.ts";
import { ApiError } from "./client.ts";
import { APP_DIR, ROOT } from "./paths.ts";
import {
  defaultVaultKvConfig,
  fetchVaultKv,
  vaultKvCliPath,
} from "./vault.ts";
import type { ProviderConnection } from "./registry.ts";

export const PROVIDERS_SPEC_PATH = join(ROOT, "providers.yaml");

export type ProviderMethod =
  | "apikey"
  | "cookie"
  | "kiro-import"
  | "cursor-import"
  | "codex-import"
  | "oauth-interactive"
  | "none";

export type SpecProviderVault = {
  apiKey?: string;
  refreshToken?: string;
  accessToken?: string;
  machineId?: string;
  clientId?: string;
  clientSecret?: string;
  region?: string;
  idToken?: string;
  email?: string;
};

export type SpecProvider = {
  id: string;
  method: ProviderMethod;
  vault?: SpecProviderVault;
  /** Explicit vault field for apikey/cookie when not using default naming */
  apiKeyVaultKey?: string;
};

export type ProvidersSpec = {
  version: number;
  defaults: { connectionName: string };
  vaultKeyOverrides: Record<string, string>;
  providers: SpecProvider[];
};

export type ResolvedProvider = SpecProvider & {
  /** Effective vault field name for primary apiKey (apikey/cookie) */
  apiKeyVaultKey: string;
};

export type SyncResultKind =
  | "created"
  | "updated"
  | "skipped_existing"
  | "skipped_missing"
  | "skipped_interactive"
  | "skipped_none"
  | "failed";

export type SyncResult = {
  id: string;
  kind: SyncResultKind;
  detail?: string;
};

const VALID_METHODS = new Set<ProviderMethod>([
  "apikey",
  "cookie",
  "kiro-import",
  "cursor-import",
  "codex-import",
  "oauth-interactive",
  "none",
]);

export function defaultApiKeyVaultField(providerId: string): string {
  return `${providerId.replace(/-/g, "_").toUpperCase()}_API_KEY`;
}

type RegistryEntry = {
  id: string;
  category?: string;
  hidden?: boolean;
  authModes?: string[];
  display?: {
    name?: string;
    website?: string;
    notice?: {
      apiKeyUrl?: string;
      signupUrl?: string;
      text?: string;
    };
  };
};

export type RegistryMeta = {
  id: string;
  name: string;
  helpUrl: string | null;
  category?: string;
};

export function credentialHelpUrl(entry: {
  display?: RegistryEntry["display"];
}): string | null {
  const notice = entry.display?.notice;
  return (
    notice?.apiKeyUrl?.trim() ||
    notice?.signupUrl?.trim() ||
    entry.display?.website?.trim() ||
    null
  );
}

async function loadRegistryEntries(): Promise<RegistryEntry[]> {
  const registryPath = join(APP_DIR, "open-sse/providers/registry/index.js");
  const mod = await import(pathToFileURL(registryPath).href);
  const entries = (mod.default ?? mod) as RegistryEntry[];
  if (!Array.isArray(entries)) {
    throw new Error(`Provider registry at ${registryPath} did not export an array`);
  }
  return entries;
}

export async function loadRegistryMeta(): Promise<Map<string, RegistryMeta>> {
  const map = new Map<string, RegistryMeta>();
  for (const entry of await loadRegistryEntries()) {
    if (!entry?.id) continue;
    map.set(entry.id, {
      id: entry.id,
      name: entry.display?.name?.trim() || entry.id,
      helpUrl: credentialHelpUrl(entry),
      category: entry.category,
    });
  }
  return map;
}

/**
 * Walk queue: combo-referenced API-key/cookie providers first, then remaining
 * apikey/cookie catalog entries. Pass comboOnly to stop after combo providers.
 * OAuth/import methods are excluded (use sync-providers / dashboard).
 */
export function buildCredWalkQueue(
  catalog: ResolvedProvider[],
  comboProviderIds: Set<string>,
  opts: { comboOnly?: boolean } = {},
): ResolvedProvider[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const queue: ResolvedProvider[] = [];
  const seen = new Set<string>();

  const isApiKeyish = (p: ResolvedProvider) =>
    p.method === "apikey" || p.method === "cookie";

  const push = (id: string) => {
    if (seen.has(id)) return;
    const p = byId.get(id);
    if (!p || !isApiKeyish(p)) return;
    seen.add(id);
    queue.push(p);
  };

  for (const id of [...comboProviderIds].sort()) push(id);
  if (opts.comboOnly) return queue;

  for (const p of catalog) {
    if (isApiKeyish(p)) push(p.id);
  }
  return queue;
}

export function loadProvidersSpec(path = PROVIDERS_SPEC_PATH): ProvidersSpec {
  const raw = parseYaml(readFileSync(path, "utf8")) as ProvidersSpec;
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid providers spec at ${path}`);
  }
  const vaultKeyOverrides = { ...(raw.vaultKeyOverrides ?? {}) };
  const defaults = {
    connectionName: raw.defaults?.connectionName?.trim() || "vault",
  };
  const providers: SpecProvider[] = [];
  const seen = new Set<string>();
  for (const p of raw.providers ?? []) {
    if (!p?.id || typeof p.id !== "string") {
      throw new Error("Each provider needs a string id");
    }
    if (seen.has(p.id)) {
      throw new Error(`Duplicate provider id in providers.yaml: ${p.id}`);
    }
    seen.add(p.id);
    const method = (p.method ?? "apikey") as ProviderMethod;
    if (!VALID_METHODS.has(method)) {
      throw new Error(`Provider "${p.id}" has invalid method: ${method}`);
    }
    providers.push({
      id: p.id,
      method,
      vault: p.vault,
      apiKeyVaultKey: p.vault?.apiKey,
    });
  }
  return {
    version: Number(raw.version) || 1,
    defaults,
    vaultKeyOverrides,
    providers,
  };
}

/**
 * Merge YAML overrides with registry auto-discovery (apikey + freeTier + dual-auth).
 */
export async function resolveProviderCatalog(
  spec: ProvidersSpec,
): Promise<ResolvedProvider[]> {
  const byId = new Map<string, SpecProvider>();
  for (const p of spec.providers) byId.set(p.id, p);

  const entries = await loadRegistryEntries();
  for (const entry of entries) {
    if (!entry?.id || entry.hidden || byId.has(entry.id)) continue;
    const cat = entry.category ?? "";
    const dualAuth = entry.authModes?.includes("apikey");
    if (cat === "apikey" || cat === "freeTier" || (cat === "oauth" && dualAuth)) {
      byId.set(entry.id, { id: entry.id, method: "apikey" });
    } else if (cat === "oauth" || cat === "free") {
      byId.set(entry.id, { id: entry.id, method: "oauth-interactive" });
    } else if (cat === "webCookie") {
      byId.set(entry.id, {
        id: entry.id,
        method: "cookie",
        vault: { apiKey: defaultApiKeyVaultField(entry.id).replace(/_API_KEY$/, "_COOKIE") },
      });
    }
  }

  const resolved: ResolvedProvider[] = [];
  for (const p of byId.values()) {
    const override = spec.vaultKeyOverrides[p.id];
    const fromVault = p.vault?.apiKey ?? p.apiKeyVaultKey;
    const apiKeyVaultKey =
      fromVault || override || defaultApiKeyVaultField(p.id);
    resolved.push({ ...p, apiKeyVaultKey });
  }
  resolved.sort((a, b) => a.id.localeCompare(b.id));
  return resolved;
}

/** Env + Vault KV (env wins). Missing Vault is non-fatal. */
export async function loadCredentialMap(): Promise<{
  creds: Record<string, string>;
  vaultPath: string;
  vaultOk: boolean;
  vaultError?: string;
}> {
  const creds: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && v.trim()) creds[k] = v.trim();
  }
  const vaultPath = vaultKvCliPath(defaultVaultKvConfig());
  try {
    const kv = await fetchVaultKv();
    for (const [k, v] of Object.entries(kv)) {
      if (typeof v === "string" && v.trim() && !creds[k]) {
        creds[k] = v.trim();
      }
    }
    return { creds, vaultPath, vaultOk: true };
  } catch (err) {
    return {
      creds,
      vaultPath,
      vaultOk: false,
      vaultError: err instanceof Error ? err.message : String(err),
    };
  }
}

export function pick(
  creds: Record<string, string>,
  ...keys: Array<string | undefined>
): string | undefined {
  for (const k of keys) {
    if (!k) continue;
    const v = creds[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function activeConnectionsByProvider(
  connections: ProviderConnection[],
): Map<string, ProviderConnection[]> {
  const map = new Map<string, ProviderConnection[]>();
  for (const c of connections) {
    if (!c.provider) continue;
    const isActive =
      c.isActive === undefined || c.isActive === true || c.isActive === 1;
    if (!isActive) continue;
    const list = map.get(c.provider) ?? [];
    list.push(c);
    map.set(c.provider, list);
  }
  return map;
}

export async function createApiKeyConnection(
  client: NineRouterClient,
  provider: string,
  name: string,
  apiKey: string,
): Promise<void> {
  await client.json("/api/providers", {
    method: "POST",
    body: JSON.stringify({ provider, name, apiKey }),
  });
}

export async function updateApiKeyConnection(
  client: NineRouterClient,
  connectionId: string,
  apiKey: string,
): Promise<void> {
  await client.json(`/api/providers/${connectionId}`, {
    method: "PUT",
    body: JSON.stringify({ apiKey }),
  });
}

async function tryKiroAutoImport(
  client: NineRouterClient,
): Promise<Record<string, unknown> | null> {
  const res = await client.fetch("/api/oauth/kiro/auto-import");
  const text = await res.text();
  if (!res.ok) return null;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (body.found && body.refreshToken) return body;
  } catch {
    /* ignore */
  }
  return null;
}

async function tryCursorAutoImport(
  client: NineRouterClient,
): Promise<{ accessToken: string; machineId: string } | null> {
  const res = await client.fetch("/api/oauth/cursor/auto-import");
  const text = await res.text();
  if (!res.ok) return null;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (body.found && body.accessToken && body.machineId) {
      return {
        accessToken: String(body.accessToken),
        machineId: String(body.machineId),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function syncOneProvider(
  client: NineRouterClient,
  provider: ResolvedProvider,
  creds: Record<string, string>,
  existing: Map<string, ProviderConnection[]>,
  opts: {
    dryRun: boolean;
    force: boolean;
    interactive: boolean;
    connectionName: string;
  },
): Promise<SyncResult> {
  const id = provider.id;
  const hasExisting = (existing.get(id)?.length ?? 0) > 0;

  if (provider.method === "none") {
    return { id, kind: "skipped_none", detail: "no credentials required" };
  }

  if (hasExisting && !opts.force) {
    return { id, kind: "skipped_existing" };
  }

  if (provider.method === "oauth-interactive") {
    if (!opts.interactive) {
      return {
        id,
        kind: "skipped_interactive",
        detail: "needs --interactive (browser/device-code OAuth)",
      };
    }
    if (opts.dryRun) {
      return { id, kind: "created", detail: "dry-run interactive" };
    }
    if (!supportsDeviceCodeOAuth(id)) {
      return {
        id,
        kind: "skipped_interactive",
        detail: `connect in dashboard at ${client.baseUrl} (no automated OAuth for this provider)`,
      };
    }
    try {
      await runInteractiveOAuth(client, id);
      return { id, kind: "created", detail: "interactive oauth" };
    } catch (err) {
      return {
        id,
        kind: "failed",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (provider.method === "apikey" || provider.method === "cookie") {
    const apiKey = pick(creds, provider.apiKeyVaultKey, provider.vault?.apiKey);
    if (!apiKey) {
      return {
        id,
        kind: "skipped_missing",
        detail: `missing ${provider.apiKeyVaultKey}`,
      };
    }
    if (opts.dryRun) {
      return {
        id,
        kind: hasExisting && opts.force ? "updated" : "created",
        detail: `dry-run ${provider.method}`,
      };
    }
    try {
      if (hasExisting && opts.force) {
        const conn = existing.get(id)![0]!;
        if (conn.id) {
          await updateApiKeyConnection(client, conn.id, apiKey);
          return { id, kind: "updated", detail: provider.apiKeyVaultKey };
        }
      }
      await createApiKeyConnection(
        client,
        id,
        opts.connectionName,
        apiKey,
      );
      return { id, kind: "created", detail: provider.apiKeyVaultKey };
    } catch (err) {
      return {
        id,
        kind: "failed",
        detail: formatErr(err),
      };
    }
  }

  if (provider.method === "kiro-import") {
    return syncKiro(client, provider, creds, opts);
  }
  if (provider.method === "cursor-import") {
    return syncCursor(client, provider, creds, opts);
  }
  if (provider.method === "codex-import") {
    return syncCodex(client, provider, creds, opts);
  }

  return { id, kind: "failed", detail: `unsupported method ${provider.method}` };
}

async function importKiroRefresh(
  client: NineRouterClient,
  refreshToken: string,
  extras: {
    clientId?: string;
    clientSecret?: string;
    region?: string;
    authMethod?: string;
    profileArn?: string;
  },
): Promise<void> {
  const body: Record<string, string> = { refreshToken };
  if (extras.clientId) body.clientId = extras.clientId;
  if (extras.clientSecret) body.clientSecret = extras.clientSecret;
  body.region = extras.region || "us-east-1";
  if (extras.authMethod) body.authMethod = extras.authMethod;
  if (extras.profileArn) body.profileArn = extras.profileArn;
  await client.json("/api/oauth/kiro/import", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function syncKiro(
  client: NineRouterClient,
  provider: ResolvedProvider,
  creds: Record<string, string>,
  opts: {
    dryRun: boolean;
    force: boolean;
    interactive: boolean;
    connectionName: string;
  },
): Promise<SyncResult> {
  const id = provider.id;
  const auto = opts.dryRun ? null : await tryKiroAutoImport(client);
  const vaultRefresh = pick(
    creds,
    provider.vault?.refreshToken,
    "KIRO_REFRESH_TOKEN",
  );
  const apiKey = pick(creds, provider.vault?.apiKey, "KIRO_API_KEY");
  const vaultExtras = {
    clientId: pick(creds, provider.vault?.clientId, "KIRO_CLIENT_ID"),
    clientSecret: pick(
      creds,
      provider.vault?.clientSecret,
      "KIRO_CLIENT_SECRET",
    ),
    region: pick(creds, provider.vault?.region, "KIRO_REGION") || "us-east-1",
  };

  if (!auto?.refreshToken && !vaultRefresh && !apiKey) {
    if (opts.interactive) {
      if (opts.dryRun) {
        return { id, kind: "created", detail: "dry-run interactive kiro" };
      }
      try {
        await runInteractiveOAuth(client, "kiro");
        return { id, kind: "created", detail: "interactive device-code" };
      } catch (err) {
        return { id, kind: "failed", detail: formatErr(err) };
      }
    }
    return {
      id,
      kind: "skipped_missing",
      detail: `missing ${provider.vault?.refreshToken ?? "KIRO_REFRESH_TOKEN"} (or KIRO_API_KEY); local auto-import unavailable`,
    };
  }

  if (opts.dryRun) {
    return {
      id,
      kind: "created",
      detail: auto || vaultRefresh ? "dry-run kiro-import" : "dry-run kiro api-key",
    };
  }

  // Prefer local auto-import, then Vault refresh token, then API key.
  // Stale local tokens fall through instead of failing the whole run.
  if (auto?.refreshToken) {
    try {
      await importKiroRefresh(client, String(auto.refreshToken), {
        clientId: (auto.clientId as string | undefined) || vaultExtras.clientId,
        clientSecret:
          (auto.clientSecret as string | undefined) || vaultExtras.clientSecret,
        region: (auto.region as string | undefined) || vaultExtras.region,
        authMethod: auto.authMethod
          ? String(auto.authMethod)
          : undefined,
        profileArn: auto.profileArn ? String(auto.profileArn) : undefined,
      });
      return { id, kind: "created", detail: "auto-import + import" };
    } catch (err) {
      if (!vaultRefresh && !apiKey) {
        if (opts.interactive) {
          try {
            await runInteractiveOAuth(client, "kiro");
            return { id, kind: "created", detail: "interactive device-code (after bad auto-import)" };
          } catch (interactiveErr) {
            return {
              id,
              kind: "failed",
              detail: formatErr(interactiveErr),
            };
          }
        }
        return {
          id,
          kind: "skipped_missing",
          detail: `local auto-import token invalid (${formatErr(err)}); set KIRO_REFRESH_TOKEN or use --interactive`,
        };
      }
    }
  }

  if (vaultRefresh) {
    try {
      await importKiroRefresh(client, vaultRefresh, vaultExtras);
      return { id, kind: "created", detail: "vault refreshToken" };
    } catch (err) {
      if (!apiKey) {
        return {
          id,
          kind: "skipped_missing",
          detail: `KIRO_REFRESH_TOKEN rejected (${formatErr(err)})`,
        };
      }
    }
  }

  if (apiKey) {
    try {
      await client.json("/api/oauth/kiro/api-key", {
        method: "POST",
        body: JSON.stringify({
          apiKey,
          region: vaultExtras.region || "us-east-1",
        }),
      });
      return { id, kind: "created", detail: "kiro api-key" };
    } catch (err) {
      return { id, kind: "failed", detail: formatErr(err) };
    }
  }

  return {
    id,
    kind: "skipped_missing",
    detail: "no usable Kiro credentials",
  };
}

async function syncCursor(
  client: NineRouterClient,
  provider: ResolvedProvider,
  creds: Record<string, string>,
  opts: { dryRun: boolean },
): Promise<SyncResult> {
  const id = provider.id;
  const auto = opts.dryRun ? null : await tryCursorAutoImport(client);
  const accessToken =
    auto?.accessToken ||
    pick(creds, provider.vault?.accessToken, "CURSOR_ACCESS_TOKEN");
  const machineId =
    auto?.machineId ||
    pick(creds, provider.vault?.machineId, "CURSOR_MACHINE_ID");

  if (!accessToken || !machineId) {
    return {
      id,
      kind: "skipped_missing",
      detail: `missing ${provider.vault?.accessToken ?? "CURSOR_ACCESS_TOKEN"} and/or ${provider.vault?.machineId ?? "CURSOR_MACHINE_ID"}; local auto-import unavailable`,
    };
  }

  if (opts.dryRun) {
    return { id, kind: "created", detail: "dry-run cursor-import" };
  }

  try {
    await client.json("/api/oauth/cursor/import", {
      method: "POST",
      body: JSON.stringify({ accessToken, machineId }),
    });
    return {
      id,
      kind: "created",
      detail: auto ? "auto-import" : "vault tokens",
    };
  } catch (err) {
    return { id, kind: "failed", detail: formatErr(err) };
  }
}

async function syncCodex(
  client: NineRouterClient,
  provider: ResolvedProvider,
  creds: Record<string, string>,
  opts: { dryRun: boolean },
): Promise<SyncResult> {
  const id = provider.id;
  const accessToken = pick(
    creds,
    provider.vault?.accessToken,
    "CODEX_ACCESS_TOKEN",
  );
  if (!accessToken) {
    return {
      id,
      kind: "skipped_missing",
      detail: `missing ${provider.vault?.accessToken ?? "CODEX_ACCESS_TOKEN"}`,
    };
  }

  const refreshToken = pick(
    creds,
    provider.vault?.refreshToken,
    "CODEX_REFRESH_TOKEN",
  );
  const idToken = pick(creds, provider.vault?.idToken, "CODEX_ID_TOKEN");
  const email = pick(creds, provider.vault?.email, "CODEX_EMAIL");

  if (opts.dryRun) {
    return {
      id,
      kind: "created",
      detail: refreshToken ? "dry-run codex bulk-import" : "dry-run codex import-token",
    };
  }

  try {
    if (refreshToken || idToken || email) {
      const account: Record<string, unknown> = { accessToken };
      if (refreshToken) account.refreshToken = refreshToken;
      if (idToken) account.idToken = idToken;
      if (email) account.email = email;
      await client.json("/api/oauth/codex/bulk-import", {
        method: "POST",
        body: JSON.stringify({ accounts: [account] }),
      });
      return { id, kind: "created", detail: "bulk-import" };
    }
    await client.json("/api/oauth/codex/import-token", {
      method: "POST",
      body: JSON.stringify({ accessToken, name: "vault" }),
    });
    return { id, kind: "created", detail: "import-token" };
  } catch (err) {
    return { id, kind: "failed", detail: formatErr(err) };
  }
}

function formatErr(err: unknown): string {
  if (err instanceof ApiError) {
    return `${err.status}: ${err.body.slice(0, 180)}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Providers with working `/api/oauth/{id}/device-code` + poll automation. */
export const DEVICE_CODE_PROVIDERS = new Set(["kiro", "github"]);

export function supportsDeviceCodeOAuth(provider: string): boolean {
  return DEVICE_CODE_PROVIDERS.has(provider);
}

/** Primary Vault field name for credential walkthrough prompts. */
export function primaryVaultKey(provider: ResolvedProvider): string | null {
  switch (provider.method) {
    case "apikey":
    case "cookie":
      return provider.apiKeyVaultKey;
    case "kiro-import":
      return provider.vault?.refreshToken ?? "KIRO_REFRESH_TOKEN";
    case "codex-import":
      return provider.vault?.accessToken ?? "CODEX_ACCESS_TOKEN";
    case "cursor-import":
      return provider.vault?.accessToken ?? "CURSOR_ACCESS_TOKEN";
    default:
      return null;
  }
}

/** Interactive device-code for kiro/github; other providers skip (caller handles). */
export async function runInteractiveOAuth(
  client: NineRouterClient,
  provider: string,
): Promise<void> {
  if (supportsDeviceCodeOAuth(provider)) {
    await runDeviceCodeFlow(client, provider);
    return;
  }
  throw new Error(
    `Interactive OAuth for "${provider}" is not automated; connect it in the dashboard at ${client.baseUrl}`,
  );
}

async function runDeviceCodeFlow(
  client: NineRouterClient,
  provider: string,
): Promise<void> {
  const device = await client.json<Record<string, unknown>>(
    `/api/oauth/${provider}/device-code`,
  );
  const userCode = String(device.user_code ?? "");
  const verifyUrl = String(
    device.verification_uri_complete ??
      device.verification_uri ??
      "",
  );
  const intervalMs = Math.max(1, Number(device.interval ?? 2)) * 1000;
  const deadline = Date.now() + Number(device.expires_in ?? 600) * 1000;
  const deviceCode = String(device.device_code ?? "");

  console.log(`\n[${provider}] device login`);
  console.log(`  user_code: ${userCode}`);
  if (verifyUrl) console.log(`  open:      ${verifyUrl}`);
  console.log(`  Complete login in the browser, then wait…`);

  if (verifyUrl) {
    try {
      spawn("open", [verifyUrl], { detached: true, stdio: "ignore" }).unref();
    } catch {
      /* ignore */
    }
  }

  const extraData =
    provider === "kiro"
      ? {
          _clientId: device._clientId,
          _clientSecret: device._clientSecret,
          _region: device._region ?? "us-east-1",
          _authMethod: device._authMethod,
          _startUrl: device._startUrl,
        }
      : undefined;

  while (Date.now() < deadline) {
    const res = await client.fetch(`/api/oauth/${provider}/poll`, {
      method: "POST",
      body: JSON.stringify(
        extraData ? { deviceCode, extraData } : { deviceCode },
      ),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (body.success && body.connection) return;
    const err = String(body.error ?? "");
    if (
      body.pending ||
      err === "authorization_pending" ||
      err === "slow_down"
    ) {
      process.stdout.write(".");
      await new Promise((r) =>
        setTimeout(r, err === "slow_down" ? intervalMs * 2 : intervalMs),
      );
      continue;
    }
    throw new Error(`poll failed: ${err || res.status} ${text.slice(0, 200)}`);
  }
  throw new Error("device code expired before authorization completed");
}

export function formatSyncSummary(results: SyncResult[]): string {
  const counts: Record<SyncResultKind, number> = {
    created: 0,
    updated: 0,
    skipped_existing: 0,
    skipped_missing: 0,
    skipped_interactive: 0,
    skipped_none: 0,
    failed: 0,
  };
  for (const r of results) counts[r.kind] += 1;
  return [
    `created=${counts.created}`,
    `updated=${counts.updated}`,
    `skipped_existing=${counts.skipped_existing}`,
    `skipped_missing=${counts.skipped_missing}`,
    `skipped_interactive=${counts.skipped_interactive}`,
    `skipped_none=${counts.skipped_none}`,
    `failed=${counts.failed}`,
  ].join("  ");
}
