#!/usr/bin/env bun
/**
 * Ensure configured external zones redirect to stack hostnames.
 *
 * Usage:
 *   bun run scripts/sync-aliases.ts
 *   bun run scripts/sync-aliases.ts --apply
 */
import {
  CloudflareApi,
  cloudflareCredentialsFromEnv,
  type CloudflareRulesetRule,
} from "../lib/cloudflare-api.js";
import { loadServicesConfig, zoneSlug, type AliasSpec } from "../lib/services.js";

const REDIRECT_PHASE = "http_request_dynamic_redirect";
const PLACEHOLDER_IPV4 = "192.0.2.1";

function parseArgs(argv: readonly string[]): { apply: boolean } {
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/sync-aliases.ts [--apply]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { apply };
}

function ruleRef(zoneSlugName: string, alias: AliasSpec, host: string): string {
  const slug = host.replace(/\./g, "_");
  return `${zoneSlugName}_alias_${alias.zone.replace(/\./g, "_")}_${slug}`;
}

function hostRedirectRule(
  alias: AliasSpec,
  host: string,
  zoneSlugName: string,
  managedComment: string,
): CloudflareRulesetRule {
  return {
    ref: ruleRef(zoneSlugName, alias, host),
    expression: `(http.host eq "${host}")`,
    description: `${managedComment} — ${host} → ${alias.target}`,
    enabled: true,
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 301,
        preserve_query_string: true,
        target_url: {
          expression: `concat("https://${alias.target}", http.request.uri.path)`,
        },
      },
    },
  };
}

function isManagedRule(
  rule: CloudflareRulesetRule,
  alias: AliasSpec,
  zoneSlugName: string,
): boolean {
  return alias.hosts.some((host) => rule.ref === ruleRef(zoneSlugName, alias, host));
}

async function ensureHostARecord(
  cf: CloudflareApi,
  zoneId: string,
  host: string,
  apply: boolean,
  managedComment: string,
): Promise<void> {
  const records = await cf.listDnsRecords(zoneId);
  const existing = records.filter((r) => r.name === host && r.type === "A");
  if (existing.length === 0) {
    console.log(`[plan] CREATE ${host} A → ${PLACEHOLDER_IPV4} (proxied)`);
    if (apply) {
      await cf.createDnsRecord(zoneId, {
        name: host,
        type: "A",
        content: PLACEHOLDER_IPV4,
        proxied: true,
        ttl: 1,
        comment: managedComment,
      });
    }
    return;
  }
  const primary = existing[0]!;
  if (primary.content !== PLACEHOLDER_IPV4 || !primary.proxied) {
    console.log(`[plan] UPDATE ${host} A`);
    if (apply) {
      await cf.updateDnsRecord(zoneId, primary.id, {
        name: host,
        type: "A",
        content: PLACEHOLDER_IPV4,
        proxied: true,
        ttl: 1,
        comment: managedComment,
      });
    }
  } else {
    console.log(`OK     ${host} A`);
  }
}

async function ensureRedirectRules(
  cf: CloudflareApi,
  zoneId: string,
  alias: AliasSpec,
  apply: boolean,
  zoneSlugName: string,
  managedComment: string,
): Promise<void> {
  const desired = alias.hosts.map((host) =>
    hostRedirectRule(alias, host, zoneSlugName, managedComment),
  );
  const entrypoint = await cf.getRulesetPhaseEntrypoint(zoneId, REDIRECT_PHASE);
  const rules = entrypoint?.rules ?? [];
  const others = rules.filter((r) => !isManagedRule(r, alias, zoneSlugName));
  const managed = rules.filter((r) => isManagedRule(r, alias, zoneSlugName));

  const desiredByRef = new Map(desired.map((r) => [r.ref!, r]));
  let changes = 0;

  for (const rule of desired) {
    const existing = managed.find((r) => r.ref === rule.ref);
    if (!existing) {
      console.log(`[plan] CREATE redirect rule ${rule.expression} → ${alias.target}`);
      changes += 1;
    } else if (existing.expression !== rule.expression) {
      console.log(`[plan] UPDATE redirect rule ${rule.ref}`);
      changes += 1;
    } else {
      console.log(`OK     redirect ${rule.ref} → ${alias.target}`);
    }
  }

  for (const stale of managed) {
    if (!desiredByRef.has(stale.ref ?? "")) {
      console.log(`[plan] DELETE stale redirect rule ${stale.ref}`);
      changes += 1;
    }
  }

  if (changes === 0 || !apply) return;

  const merged = desired.map((rule) => {
    const existing = managed.find((r) => r.ref === rule.ref);
    return existing?.id ? { ...rule, id: existing.id } : rule;
  });

  const body = {
    // Phase entrypoint rulesets are named "default" and cannot be renamed on update.
    name: entrypoint?.name ?? `${alias.zone} alias redirects`,
    kind: "zone" as const,
    phase: REDIRECT_PHASE,
    rules: [...others, ...merged],
  };

  if (entrypoint) {
    await cf.updateRuleset(zoneId, entrypoint.id, body);
  } else {
    await cf.createRuleset(zoneId, body);
  }
}

async function syncAlias(
  cf: CloudflareApi,
  alias: AliasSpec,
  apply: boolean,
  zoneSlugName: string,
  managedComment: string,
): Promise<void> {
  const zone = await cf.findZoneByName(alias.zone);
  if (!zone) {
    console.error(`Zone "${alias.zone}" not found in Cloudflare account`);
    process.exit(1);
  }

  console.log(`\nAlias zone ${alias.zone} → ${alias.target} (${apply ? "APPLY" : "DRY-RUN"})`);
  for (const host of alias.hosts) {
    await ensureHostARecord(cf, zone.id, host, apply, managedComment);
  }
  await ensureRedirectRules(cf, zone.id, alias, apply, zoneSlugName, managedComment);
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  if (!cloudflareCredentialsFromEnv()) {
    console.warn(
      "Skipping alias sync — CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) not set",
    );
    return;
  }
  const config = loadServicesConfig();
  const slug = zoneSlug(config.zone);
  const managedComment = `managed by infra/scripts/sync-aliases.ts (${config.zone})`;
  const aliases = config.aliases ?? [];

  if (aliases.length === 0) {
    console.log("No aliases configured in services.yaml");
    return;
  }

  const cf = new CloudflareApi();
  for (const alias of aliases) {
    await syncAlias(cf, alias, apply, slug, managedComment);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
