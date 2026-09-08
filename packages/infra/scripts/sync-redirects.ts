#!/usr/bin/env bun
/**
 * Ensure apex zone redirects to www via Cloudflare.
 *
 * Usage:
 *   bun run scripts/sync-redirects.ts
 *   bun run scripts/sync-redirects.ts --apply
 */
import {
  CloudflareApi,
  cloudflareCredentialsFromEnv,
  type CloudflareRulesetRule,
} from "../lib/cloudflare-api.js";
import { assert, hotAssert, type Assert } from "@pkgs/assert";
import { loadServicesConfig, zoneSlug } from "../lib/services.js";

const ha: Assert = hotAssert();

const REDIRECT_PHASE = "http_request_dynamic_redirect";
const APEX_PLACEHOLDER_IPV4 = "192.0.2.1";

function parseArgs(argv: readonly string[]): { apply: boolean } {
  assert.ok(Array.isArray(argv), "sync-redirects argv must be an array");
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/sync-redirects.ts [--apply]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { apply };
}

function apexRedirectRule(
  fromHost: string,
  toHost: string,
  ruleRef: string,
  managedComment: string,
): CloudflareRulesetRule {
  assert.nonEmptyString(fromHost, "sync-redirects from host must be non-empty");
  assert.nonEmptyString(toHost, "sync-redirects to host must be non-empty");
  assert.nonEmptyString(ruleRef, "sync-redirects rule ref must be non-empty");
  assert.nonEmptyString(managedComment, "sync-redirects managed comment must be non-empty");
  const rule = {
    ref: ruleRef,
    expression: `(http.host eq "${fromHost}")`,
    description: `${managedComment} — ${fromHost} → ${toHost}`,
    enabled: true,
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 301,
        preserve_query_string: true,
        target_url: {
          expression: `concat("https://${toHost}", http.request.uri.path)`,
        },
      },
    },
  };
  assert.nonEmptyString(rule.ref, "sync-redirects rule ref must be non-empty");
  assert.nonEmptyString(rule.expression, "sync-redirects rule expression must be non-empty");
  return rule;
}

async function ensureApexARecord(
  cf: CloudflareApi,
  zoneId: string,
  apex: string,
  apply: boolean,
  managedComment: string,
): Promise<void> {
  assert.ok(cf instanceof CloudflareApi, "sync-redirects cf client must be a CloudflareApi");
  assert.nonEmptyString(zoneId, "sync-redirects zone id must be non-empty");
  assert.nonEmptyString(apex, "sync-redirects apex must be non-empty");
  assert.ok(typeof apply === "boolean", "sync-redirects apply must be a boolean");
  assert.nonEmptyString(managedComment, "sync-redirects managed comment must be non-empty");
  const records = await cf.listDnsRecords(zoneId);
  const existing = records.filter((r) => r.name === apex && r.type === "A");
  if (existing.length === 0) {
    console.log(`[plan] CREATE ${apex} A → ${APEX_PLACEHOLDER_IPV4} (proxied)`);
    if (apply) {
      await cf.createDnsRecord(zoneId, {
        name: apex,
        type: "A",
        content: APEX_PLACEHOLDER_IPV4,
        proxied: true,
        ttl: 1,
        comment: managedComment,
      });
    }
    return;
  }
  const primary = existing[0]!;
  assert.defined(primary, "sync-redirects primary A record must be defined");
  assert.nonEmptyString(primary.id, "sync-redirects primary record id must be non-empty");
  if (primary.content !== APEX_PLACEHOLDER_IPV4 || !primary.proxied) {
    console.log(`[plan] UPDATE ${apex} A`);
    if (apply) {
      await cf.updateDnsRecord(zoneId, primary.id, {
        name: apex,
        type: "A",
        content: APEX_PLACEHOLDER_IPV4,
        proxied: true,
        ttl: 1,
        comment: managedComment,
      });
    }
  } else {
    console.log(`OK     ${apex} A`);
  }
}

async function ensureRedirectRule(
  cf: CloudflareApi,
  zoneId: string,
  apex: string,
  www: string,
  apply: boolean,
  ruleRef: string,
  managedComment: string,
): Promise<void> {
  assert.ok(cf instanceof CloudflareApi, "sync-redirects cf client must be a CloudflareApi");
  assert.nonEmptyString(zoneId, "sync-redirects zone id must be non-empty");
  assert.nonEmptyString(apex, "sync-redirects apex must be non-empty");
  assert.nonEmptyString(www, "sync-redirects www host must be non-empty");
  assert.ok(typeof apply === "boolean", "sync-redirects apply must be a boolean");
  assert.nonEmptyString(ruleRef, "sync-redirects rule ref must be non-empty");
  assert.nonEmptyString(managedComment, "sync-redirects managed comment must be non-empty");
  const desired = apexRedirectRule(apex, www, ruleRef, managedComment);
  const entrypoint = await cf.getRulesetPhaseEntrypoint(zoneId, REDIRECT_PHASE);
  assert.ok(
    entrypoint === undefined || entrypoint === null || typeof entrypoint === "object",
    "sync-redirects ruleset entrypoint must be an object when present",
  );
  const rules = entrypoint?.rules ?? [];
  const managed = rules.filter((r) => r.ref === ruleRef);
  const others = rules.filter((r) => r.ref !== ruleRef);

  if (managed.length === 0) {
    console.log(`[plan] CREATE redirect rule ${apex} → ${www}`);
    if (!apply) return;
    const body = {
      name: entrypoint?.name ?? `${apex} redirects`,
      kind: "zone" as const,
      phase: REDIRECT_PHASE,
      rules: [...others, desired],
    };
    if (entrypoint) {
      await cf.updateRuleset(zoneId, entrypoint.id, body);
    } else {
      await cf.createRuleset(zoneId, body);
    }
    return;
  }

  const primary = managed[0]!;
  assert.defined(primary, "sync-redirects primary redirect rule must be defined");
  assert.defined(entrypoint, "sync-redirects entrypoint must be defined when updating redirect rules");
  if (primary.expression !== desired.expression) {
    console.log(`[plan] UPDATE redirect rule`);
    if (apply) {
      await cf.updateRuleset(zoneId, entrypoint!.id, {
        name: entrypoint!.name,
        kind: "zone",
        phase: REDIRECT_PHASE,
        rules: [...others, { ...desired, id: primary.id }],
      });
    }
  } else {
    console.log(`OK     redirect ${apex} → ${www}`);
  }
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  assert.ok(typeof apply === "boolean", "sync-redirects apply must be a boolean");
  const cfCreds = cloudflareCredentialsFromEnv();
  if (!cfCreds) {
    console.warn(
      "Skipping apex redirect sync — CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) not set",
    );
    return;
  }
  assert.ok(!!cfCreds, "sync-redirects cloudflare credentials must be present after env check", {
    name: "CLOUDFLARE_API_TOKEN",
  });
  const config = loadServicesConfig();
  assert.defined(config, "sync-redirects services config must be defined");
  assert.nonEmptyString(config.zone, "sync-redirects zone must be non-empty");
  const slug = zoneSlug(config.zone);
  assert.nonEmptyString(slug, "sync-redirects zone slug must be non-empty");
  const ruleRef = `${slug}_apex_to_www`;
  assert.nonEmptyString(ruleRef, "sync-redirects rule ref must be non-empty");
  const managedComment = `managed by infra/scripts/sync-redirects.ts (${config.zone})`;
  assert.nonEmptyString(managedComment, "sync-redirects managed comment must be non-empty");
  const apex = config.zone;
  assert.nonEmptyString(apex, "sync-redirects apex must be non-empty");
  const portfolio = config.services.find((s) => {
    ha.nonEmptyString(s.id, "sync-redirects service id must be non-empty");
    return s.id === "portfolio";
  });
  assert.ok(
    portfolio === undefined || typeof portfolio === "object",
    "sync-redirects portfolio lookup must be an object when found",
  );
  const www = portfolio?.hostname ?? `www.${config.zone}`;
  assert.nonEmptyString(www, "sync-redirects www host must be non-empty");

  const cf = new CloudflareApi();
  const zone = await cf.findZoneByName(config.zone);
  if (!zone) {
    console.error(`Zone "${config.zone}" not found`);
    process.exit(1);
  }
  assert.defined(zone, "sync-redirects zone must be defined after friendly check");
  assert.nonEmptyString(zone.id, "sync-redirects zone id must be non-empty");

  console.log(`Sync apex redirect (${apply ? "APPLY" : "DRY-RUN"}): ${apex} → ${www}`);
  await ensureApexARecord(cf, zone.id, apex, apply, managedComment);
  await ensureRedirectRule(cf, zone.id, apex, www, apply, ruleRef, managedComment);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
