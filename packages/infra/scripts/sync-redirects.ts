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
import { loadServicesConfig, zoneSlug } from "../lib/services.js";

const REDIRECT_PHASE = "http_request_dynamic_redirect";
const APEX_PLACEHOLDER_IPV4 = "192.0.2.1";

function parseArgs(argv: readonly string[]): { apply: boolean } {
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
  return {
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
}

async function ensureApexARecord(
  cf: CloudflareApi,
  zoneId: string,
  apex: string,
  apply: boolean,
  managedComment: string,
): Promise<void> {
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
  const desired = apexRedirectRule(apex, www, ruleRef, managedComment);
  const entrypoint = await cf.getRulesetPhaseEntrypoint(zoneId, REDIRECT_PHASE);
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
  if (!cloudflareCredentialsFromEnv()) {
    console.warn(
      "Skipping apex redirect sync — CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) not set",
    );
    return;
  }
  const config = loadServicesConfig();
  const slug = zoneSlug(config.zone);
  const ruleRef = `${slug}_apex_to_www`;
  const managedComment = `managed by infra/scripts/sync-redirects.ts (${config.zone})`;
  const apex = config.zone;
  const www = config.services.find((s) => s.id === "portfolio")?.hostname ?? `www.${config.zone}`;

  const cf = new CloudflareApi();
  const zone = await cf.findZoneByName(config.zone);
  if (!zone) {
    console.error(`Zone "${config.zone}" not found`);
    process.exit(1);
  }

  console.log(`Sync apex redirect (${apply ? "APPLY" : "DRY-RUN"}): ${apex} → ${www}`);
  await ensureApexARecord(cf, zone.id, apex, apply, managedComment);
  await ensureRedirectRule(cf, zone.id, apex, www, apply, ruleRef, managedComment);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
