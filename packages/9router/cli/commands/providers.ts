import { spawn } from "node:child_process";
import {
  createAuthedClient,
  type NineRouterClient,
} from "../../scripts/lib/client.ts";
import { loadCombosSpec } from "../../scripts/lib/combos.ts";
import {
  activeConnectionsByProvider,
  buildCredWalkQueue,
  createApiKeyConnection,
  formatSyncSummary,
  loadCredentialMap,
  loadProvidersSpec,
  loadRegistryMeta,
  primaryVaultKey,
  resolveProviderCatalog,
  runInteractiveOAuth,
  syncOneProvider,
  type ResolvedProvider,
  type SyncResult,
} from "../../scripts/lib/providers.ts";
import {
  providersReferencedByTemplate,
  fetchProviderConnections,
  loadProviderIndex,
  missingCredentialProviders,
  activeProviderIds,
} from "../../scripts/lib/registry.ts";
import {
  defaultVaultKvConfig,
  patchVaultKv,
  vaultKvCliPath,
} from "../../scripts/lib/vault.ts";
import { askConfirm, askPassword, askSelect } from "../prompt.ts";
import { CommandError, type Command } from "../types.ts";

function openBrowser(url: string): void {
  try {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* ignore */
  }
}

function statusLine(vaultHas: boolean, connected: boolean): string {
  return [
    vaultHas ? "in Vault" : "missing in Vault",
    connected ? "connected in 9Router" : "no 9Router connection",
  ].join("; ");
}

async function connectAfterWrite(
  client: NineRouterClient,
  provider: ResolvedProvider,
  creds: Record<string, string>,
  connectionName: string,
): Promise<string> {
  const existing = activeConnectionsByProvider(
    await fetchProviderConnections(client),
  );
  const result = await syncOneProvider(client, provider, creds, existing, {
    dryRun: false,
    force: true,
    interactive: false,
    connectionName,
  });
  return `${result.kind}${result.detail ? ` (${result.detail})` : ""}`;
}

export async function syncProviders(): Promise<void> {
  const dryRun = await askConfirm(
    "Dry run only?",
    "Show planned provider actions without creating or updating connections.",
    false,
  );
  const force = await askConfirm(
    "Force refresh API keys?",
    "Update API keys on providers that already have a connection.",
    false,
  );
  const interactive = await askConfirm(
    "Run interactive OAuth?",
    "Device-code OAuth for kiro/github (opens the browser and polls).",
    false,
  );
  const strict = await askConfirm(
    "Strict mode?",
    "Fail if any combo-referenced provider still lacks credentials afterward.",
    false,
  );

  const spec = loadProvidersSpec();
  const catalog = await resolveProviderCatalog(spec);
  const { creds, vaultPath, vaultOk, vaultError } = await loadCredentialMap();

  console.log(`==> Sync providers (${catalog.length} in catalog)`);
  console.log(
    vaultOk
      ? `    Vault: ${vaultPath} (ok)`
      : `    Vault: ${vaultPath} (unavailable${vaultError ? `: ${vaultError.slice(0, 80)}` : ""}) — using process env only`,
  );
  if (dryRun) console.log("    Mode: dry-run");
  if (force) console.log("    Mode: force");
  if (interactive) console.log("    Mode: interactive");

  const client = await createAuthedClient();
  const connections = await fetchProviderConnections(client);
  const existing = activeConnectionsByProvider(connections);

  const results: SyncResult[] = [];
  for (const provider of catalog) {
    const result = await syncOneProvider(client, provider, creds, existing, {
      dryRun,
      force,
      interactive,
      connectionName: spec.defaults.connectionName,
    });
    results.push(result);

    const tag =
      result.kind === "created"
        ? "+"
        : result.kind === "updated"
          ? "~"
          : result.kind === "failed"
            ? "!"
            : "·";
    const detail = result.detail ? `  (${result.detail})` : "";
    console.log(`  ${tag} ${result.kind.padEnd(22)} ${result.id}${detail}`);

    if (!dryRun && (result.kind === "created" || result.kind === "updated")) {
      const list = existing.get(provider.id) ?? [];
      if (list.length === 0) {
        existing.set(provider.id, [
          {
            provider: provider.id,
            name: spec.defaults.connectionName,
            isActive: true,
          },
        ]);
      }
    }
  }

  console.log(`\n==> Summary`);
  console.log(`    ${formatSyncSummary(results)}`);

  const failed = results.filter((r) => r.kind === "failed");
  if (failed.length > 0) {
    throw new CommandError(
      `${failed.length} provider(s) failed to connect.`,
    );
  }

  if (strict) {
    const index = await loadProviderIndex();
    const comboSpec = loadCombosSpec();
    const needed = providersReferencedByTemplate(comboSpec, index);
    const fresh = dryRun
      ? connections
      : await fetchProviderConnections(client);
    const active = activeProviderIds(fresh, index);
    const missing = missingCredentialProviders(needed, active);
    if (missing.length > 0) {
      throw new CommandError(
        [
          `Strict: combo providers still missing credentials: ${missing.join(", ")}`,
          `Add Vault keys or enable interactive OAuth, then open ${client.baseUrl}`,
        ].join("\n"),
      );
    }
    console.log(
      `\nStrict: all ${needed.size} combo-referenced provider(s) have credentials.`,
    );
  }
}

export async function setupProviderCreds(): Promise<void> {
  const scope = await askSelect<"combo-only" | "all">({
    message: "Provider scope",
    description:
      "Which API-key providers to walk through (OAuth providers are not included).",
    choices: [
      {
        name: "Combo providers first, then catalog",
        value: "all",
        description:
          "Providers referenced by combos.yaml first, then remaining API-key catalog",
      },
      {
        name: "Combo providers only",
        value: "combo-only",
        description: "Only API-key providers referenced by combos.yaml",
      },
    ],
    default: "all",
  });
  const comboOnly = scope === "combo-only";

  const dryRun = await askConfirm(
    "Dry run only?",
    "Show steps without writing Vault or creating connections.",
    false,
  );
  const openBrowserUrls = await askConfirm(
    "Open get-key URLs in the browser?",
    "Launch each provider’s help/get-key page automatically.",
    true,
  );
  const connectAfter = await askConfirm(
    "Connect in 9Router after writing Vault?",
    "Create or refresh the provider connection once the secret is saved.",
    true,
  );
  const force = await askConfirm(
    "Re-prompt when Vault already has the key?",
    "Ask again even if the credential is already present in Vault.",
    false,
  );

  const noOpen = !openBrowserUrls;
  const noConnect = !connectAfter;

  const spec = loadProvidersSpec();
  const catalog = await resolveProviderCatalog(spec);
  const meta = await loadRegistryMeta();
  const index = await loadProviderIndex();
  const comboIds = providersReferencedByTemplate(loadCombosSpec(), index);
  const queue = buildCredWalkQueue(catalog, comboIds, { comboOnly });

  const { creds, vaultPath, vaultOk, vaultError } = await loadCredentialMap();
  console.log(`==> Setup API-key provider credentials`);
  console.log(
    vaultOk
      ? `    Vault: ${vaultPath} (ok)`
      : `    Vault: ${vaultPath} (unavailable${vaultError ? `: ${vaultError.slice(0, 60)}` : ""})`,
  );
  console.log(
    `    Queue: ${queue.length} API-key provider(s)${comboOnly ? " (combo-only)" : " (combo-first, then catalog)"}`,
  );
  if (dryRun) console.log("    Mode: dry-run");

  if (!vaultOk && !dryRun) {
    throw new CommandError(
      [
        "Cannot write secrets without Vault access. Fix auth, then retry.",
        "  vault login -method=userpass username=crvouga",
      ].join("\n"),
    );
  }

  const client = await createAuthedClient();
  let connections = await fetchProviderConnections(client);
  let connected = activeConnectionsByProvider(connections);

  let wrote = 0;
  let connectedN = 0;
  let skipped = 0;
  let quit = false;

  for (let i = 0; i < queue.length; i++) {
    const provider = queue[i]!;
    const info = meta.get(provider.id);
    const name = info?.name ?? provider.id;
    const helpUrl = info?.helpUrl ?? null;
    const vaultKey = primaryVaultKey(provider);
    const vaultHas = vaultKey ? Boolean(creds[vaultKey]?.trim()) : false;
    const isConnected = (connected.get(provider.id)?.length ?? 0) > 0;

    console.log(`\n[${i + 1}/${queue.length}] ${name}  (${provider.id})`);
    if (vaultKey) console.log(`  Vault key:  ${vaultKey}`);
    if (helpUrl) console.log(`  Get key:    ${helpUrl}`);
    else console.log(`  Get key:    (no URL in registry — check provider docs)`);
    console.log(`  Status:     ${statusLine(vaultHas, isConnected)}`);

    if (vaultHas && !force) {
      const overwrite = await askSelect<"y" | "n" | "q">({
        message: `Already in Vault (${vaultKey})`,
        description: "Overwrite the existing secret, skip, or quit the walkthrough.",
        choices: [
          {
            name: "Skip",
            value: "n",
            description: "Keep existing Vault secret (still connect if needed)",
          },
          {
            name: "Overwrite",
            value: "y",
            description: "Paste a new secret and write to Vault",
          },
          {
            name: "Quit",
            value: "q",
            description: "Stop the walkthrough; keep progress so far",
          },
        ],
        default: "n",
      });
      if (overwrite === "q") {
        quit = true;
        break;
      }
      if (overwrite !== "y") {
        skipped += 1;
        if (!noConnect && !isConnected && vaultKey && creds[vaultKey]) {
          if (!dryRun) {
            try {
              const detail = await connectAfterWrite(
                client,
                provider,
                creds,
                spec.defaults.connectionName,
              );
              console.log(`  ✓ Connect: ${detail}`);
              connectedN += 1;
            } catch (err) {
              console.log(
                `  ! Connect failed: ${err instanceof Error ? err.message : err}`,
              );
            }
          }
        }
        continue;
      }
    }

    if (helpUrl && !noOpen && !dryRun) {
      console.log("  Opening browser…");
      openBrowser(helpUrl);
    }

    const promptKey = vaultKey ?? "API_KEY";
    const raw = await askPassword({
      message: `Paste ${promptKey}`,
      description:
        "Hidden input. Leave empty to skip this provider; type q then Enter to quit.",
    });
    const trimmed = raw.trim();

    if (trimmed.toLowerCase() === "q") {
      quit = true;
      break;
    }
    if (!trimmed || trimmed.toLowerCase() === "s") {
      skipped += 1;
      continue;
    }

    if (!vaultKey) {
      console.log("  ! No Vault key mapping for this provider; skipping write");
      skipped += 1;
      continue;
    }

    const fields: Record<string, string> = { [vaultKey]: trimmed };

    if (dryRun) {
      console.log(
        `  (dry-run) would patch ${vaultKey} → ${vaultKvCliPath(defaultVaultKvConfig())}`,
      );
      wrote += 1;
      continue;
    }

    try {
      await patchVaultKv(fields);
      creds[vaultKey] = trimmed;
      console.log(
        `  ✓ Wrote ${vaultKey} to ${vaultKvCliPath(defaultVaultKvConfig())}`,
      );
      wrote += 1;
    } catch (err) {
      console.error(
        `  ! Vault write failed: ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    if (!noConnect) {
      try {
        if (!isConnected) {
          await createApiKeyConnection(
            client,
            provider.id,
            spec.defaults.connectionName,
            trimmed,
          );
          console.log(`  ✓ Created 9Router connection`);
          connectedN += 1;
        } else {
          const detail = await connectAfterWrite(
            client,
            provider,
            creds,
            spec.defaults.connectionName,
          );
          console.log(`  ✓ Connect: ${detail}`);
          if (detail.startsWith("created") || detail.startsWith("updated")) {
            connectedN += 1;
          }
        }
        connections = await fetchProviderConnections(client);
        connected = activeConnectionsByProvider(connections);
      } catch (err) {
        console.log(
          `  ! Connect failed (Vault key saved): ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  console.log(`\n==> Summary`);
  console.log(
    `    wrote=${wrote}  connected=${connectedN}  skipped=${skipped}${quit ? "  (quit early)" : ""}`,
  );
  console.log(`\nNext: Providers: Sync, then Combos: Check.`);
  console.log(
    `OAuth (Claude, Kiro, …): dashboard or Providers: Sync with interactive OAuth.`,
  );
}

export async function connectKiro(): Promise<void> {
  const ok = await askConfirm(
    "Start Kiro device-code login?",
    "Opens the browser and polls until Kiro is connected to 9Router.",
    true,
  );
  if (!ok) {
    console.log("Cancelled.");
    return;
  }
  const client = await createAuthedClient();
  await runInteractiveOAuth(client, "kiro");
  console.log("OK — Kiro connected.");
}

export const providersCommands: Command[] = [
  {
    id: "sync-providers",
    name: "Providers: Sync",
    description: "Create or refresh provider connections from Vault/env",
    run: syncProviders,
  },
  {
    id: "setup-provider-creds",
    name: "Providers: Setup credentials",
    description: "Paste API keys into Vault and connect them in 9Router",
    run: setupProviderCreds,
  },
  {
    id: "connect-kiro",
    name: "Providers: Connect Kiro",
    description: "Run device-code OAuth for the Kiro provider",
    run: connectKiro,
  },
];
