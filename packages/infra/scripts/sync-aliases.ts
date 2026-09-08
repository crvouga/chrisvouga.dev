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
import { assert, hotAssert, type Assert } from "@pkgs/assert";
import { loadServicesConfig, zoneSlug, type AliasSpec } from "../lib/services.js";

const ha: Assert = hotAssert();

const REDIRECT_PHASE = "http_request_dynamic_redirect";
const PLACEHOLDER_IPV4 = "192.0.2.1";

function parseArgs(argv: readonly string[]): { apply: boolean } {
  assert.ok(Array.isArray(argv), "sync-aliases argv must be an array");
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
  assert.nonEmptyString(zoneSlugName, "sync-aliases zone slug must be non-empty");
  assert.defined(alias, "sync-aliases alias spec must be defined");
  assert.nonEmptyString(alias.zone, "sync-aliases alias zone must be non-empty");
  assert.nonEmptyString(host, "sync-aliases alias host must be non-empty");
  const slug = host.replace(/\./g, "_");
  const ref = `${zoneSlugName}_alias_${alias.zone.replace(/\./g, "_")}_${slug}`;
  assert.nonEmptyString(ref, "sync-aliases rule ref must be non-empty");
  return ref;
}

function hostRedirectRule(
  alias: AliasSpec,
  host: string,
  zoneSlugName: string,
  managedComment: string,
): CloudflareRulesetRule {
  assert.defined(alias, "sync-aliases alias spec must be defined");
  assert.nonEmptyString(alias.target, "sync-aliases alias target must be non-empty");
  assert.nonEmptyString(host, "sync-aliases alias host must be non-empty");
  assert.nonEmptyString(zoneSlugName, "sync-aliases zone slug must be non-empty");
  assert.nonEmptyString(managedComment, "sync-aliases managed comment must be non-empty");
  const rule = {
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
  assert.nonEmptyString(rule.ref, "sync-aliases rule ref must be non-empty");
  assert.nonEmptyString(rule.expression, "sync-aliases rule expression must be non-empty");
  return rule;
}

function isManagedRule(
  rule: CloudflareRulesetRule,
  alias: AliasSpec,
  zoneSlugName: string,
): boolean {
  assert.defined(rule, "sync-aliases rule must be defined");
  assert.defined(alias, "sync-aliases alias spec must be defined");
  assert.nonEmptyString(zoneSlugName, "sync-aliases zone slug must be non-empty");
  return alias.hosts.some((host) => {
    ha.nonEmptyString(host, "sync-aliases alias host must be non-empty");
    return rule.ref === ruleRef(zoneSlugName, alias, host);
  });
}

async function ensureHostARecord(
  cf: CloudflareApi,
  zoneId: string,
  host: string,
  apply: boolean,
  managedComment: string,
): Promise<void> {
  assert.ok(cf instanceof CloudflareApi, "sync-aliases cf client must be a CloudflareApi");
  assert.nonEmptyString(zoneId, "sync-aliases zone id must be non-empty");
  assert.nonEmptyString(host, "sync-aliases alias host must be non-empty");
  assert.ok(typeof apply === "boolean", "sync-aliases apply must be a boolean");
  assert.nonEmptyString(managedComment, "sync-aliases managed comment must be non-empty");
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
  assert.defined(primary, "sync-aliases primary A record must be defined");
  assert.nonEmptyString(primary.id, "sync-aliases primary record id must be non-empty");
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
  assert.ok(cf instanceof CloudflareApi, "sync-aliases cf client must be a CloudflareApi");
  assert.nonEmptyString(zoneId, "sync-aliases zone id must be non-empty");
  assert.defined(alias, "sync-aliases alias spec must be defined");
  assert.ok(typeof apply === "boolean", "sync-aliases apply must be a boolean");
  assert.nonEmptyString(zoneSlugName, "sync-aliases zone slug must be non-empty");
  assert.nonEmptyString(managedComment, "sync-aliases managed comment must be non-empty");
  const desired = alias.hosts.map((host) => {
    ha.nonEmptyString(host, "sync-aliases alias host must be non-empty");
    return hostRedirectRule(alias, host, zoneSlugName, managedComment);
  });
  const entrypoint = await cf.getRulesetPhaseEntrypoint(zoneId, REDIRECT_PHASE);
  assert.ok(
    entrypoint === undefined || entrypoint === null || typeof entrypoint === "object",
    "sync-aliases ruleset entrypoint must be an object when present",
  );
  const rules = entrypoint?.rules ?? [];
  const others = rules.filter((r) => !isManagedRule(r, alias, zoneSlugName));
  const managed = rules.filter((r) => isManagedRule(r, alias, zoneSlugName));

  const desiredByRef = new Map(desired.map((r) => {
    ha.nonEmptyString(r.ref, "sync-aliases desired rule ref must be non-empty");
    return [r.ref!, r] as const;
  }));
  let changes = 0;

  for (const rule of desired) {
    ha.nonEmptyString(rule.ref, "sync-aliases desired rule ref must be non-empty");
    ha.nonEmptyString(rule.expression, "sync-aliases desired rule expression must be non-empty");
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
    ha.ok(
      stale.ref === undefined || typeof stale.ref === "string",
      "sync-aliases stale rule ref must be a string when present",
    );
    if (!desiredByRef.has(stale.ref ?? "")) {
      console.log(`[plan] DELETE stale redirect rule ${stale.ref}`);
      changes += 1;
    }
  }
  assert.nonNegative(changes, "sync-aliases change count must be non-negative");

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
  assert.ok(cf instanceof CloudflareApi, "sync-aliases cf client must be a CloudflareApi");
  assert.defined(alias, "sync-aliases alias spec must be defined");
  assert.nonEmptyString(alias.zone, "sync-aliases alias zone must be non-empty");
  assert.nonEmptyString(alias.target, "sync-aliases alias target must be non-empty");
  assert.ok(typeof apply === "boolean", "sync-aliases apply must be a boolean");
  assert.nonEmptyString(zoneSlugName, "sync-aliases zone slug must be non-empty");
  assert.nonEmptyString(managedComment, "sync-aliases managed comment must be non-empty");
  const zone = await cf.findZoneByName(alias.zone);
  if (!zone) {
    console.error(`Zone "${alias.zone}" not found in Cloudflare account`);
    process.exit(1);
  }
  assert.defined(zone, "sync-aliases zone must be defined after friendly check");
  assert.nonEmptyString(zone.id, "sync-aliases zone id must be non-empty");

  console.log(`\nAlias zone ${alias.zone} → ${alias.target} (${apply ? "APPLY" : "DRY-RUN"})`);
  for (const host of alias.hosts) {
    ha.nonEmptyString(host, "sync-aliases alias host must be non-empty");
    await ensureHostARecord(cf, zone.id, host, apply, managedComment);
  }
  await ensureRedirectRules(cf, zone.id, alias, apply, zoneSlugName, managedComment);
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  assert.ok(typeof apply === "boolean", "sync-aliases apply must be a boolean");
  const cfCreds = cloudflareCredentialsFromEnv();
  if (!cfCreds) {
    console.warn(
      "Skipping alias sync — CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) not set",
    );
    return;
  }
  assert.ok(!!cfCreds, "sync-aliases cloudflare credentials must be present after env check", {
    name: "CLOUDFLARE_API_TOKEN",
  });
  const config = loadServicesConfig();
  assert.defined(config, "sync-aliases services config must be defined");
  assert.nonEmptyString(config.zone, "sync-aliases zone must be non-empty");
  const slug = zoneSlug(config.zone);
  assert.nonEmptyString(slug, "sync-aliases zone slug must be non-empty");
  const managedComment = `managed by infra/scripts/sync-aliases.ts (${config.zone})`;
  assert.nonEmptyString(managedComment, "sync-aliases managed comment must be non-empty");
  assert.ok(
    config.aliases === undefined || Array.isArray(config.aliases),
    "sync-aliases config aliases must be an array when present",
  );
  const aliases = config.aliases ?? [];

  if (aliases.length === 0) {
    console.log("No aliases configured in services.yaml");
    return;
  }

  const cf = new CloudflareApi();
  for (const alias of aliases) {
    ha.nonEmptyString(alias.zone, "sync-aliases alias zone must be non-empty");
    await syncAlias(cf, alias, apply, slug, managedComment);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
