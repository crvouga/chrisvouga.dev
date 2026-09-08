#!/usr/bin/env bun
/**
 * Reconcile Cloudflare DNS for Railway custom domains.
 *
 * Per public hostname: CNAME + TXT from Railway customDomainCreate status.
 * On --apply, retries Railway TLS issuance for domains stuck in ISSUE_FAILED.
 *
 * Usage:
 *   bun run scripts/sync-dns.ts
 *   bun run scripts/sync-dns.ts --apply
 *   bun run scripts/sync-dns.ts --apply --wait-for-certs
 *   bun run scripts/sync-dns.ts --id portfolio --apply
 */
import { CloudflareApi, cloudflareCredentialsFromEnv, type CloudflareDnsRecord } from "../lib/cloudflare-api.js";
import { assert, hotAssert, type Assert } from "@pkgs/assert";
import {
  ensureCustomDomain,
  findServiceByName,
  getCustomDomain,
  isCustomDomainCertificateFailed,
  isCustomDomainCertificateReady,
  issueCustomDomainCertificate,
  railwayDnsRecords,
  resolveEnvironment,
  resolveProjectContext,
  type RailwayCustomDomain,
} from "../lib/railway-api.js";
import { ensureRailwayToken } from "../lib/railway-token.js";
import {
  allDnsTargets,
  isPublicService,
  loadServicesConfig,
  normalizeDnsHostname,
  railwayEnvironmentName,
  railwayIsPublic,
  railwayProjectName,
  railwayServiceName,
  standaloneVaultHostname,
  type DnsTarget,
  type ServicesConfig,
} from "../lib/services.js";

type RecordType = "CNAME" | "TXT";

const ha: Assert = hotAssert();

type DesiredRecord = {
  readonly type: RecordType;
  readonly name: string;
  readonly content: string;
};

type Args = {
  readonly ids: readonly string[];
  readonly apply: boolean;
  readonly proxied: boolean;
  readonly pruneOrphans: boolean;
  readonly waitForCerts: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  assert.ok(Array.isArray(argv), "sync-dns argv must be an array");
  const ids: string[] = [];
  let apply = false;
  let proxied = false;
  let pruneOrphans = true;
  let waitForCerts = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") {
      const next = argv[++i];
      assert.ok(
        next === undefined || typeof next === "string",
        "sync-dns --id value must be a string when present",
      );
      ids.push(next ?? "");
    } else if (arg === "--apply") apply = true;
    else if (arg === "--dns-only") proxied = false;
    else if (arg === "--no-prune") pruneOrphans = false;
    else if (arg === "--wait-for-certs") waitForCerts = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/sync-dns.ts [--id <id> ...] [--apply] [--dns-only] [--no-prune] [--wait-for-certs]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  // Targeted sync must not prune other hostnames' verification records.
  if (ids.length > 0) pruneOrphans = false;

  const result = { ids: ids.filter(Boolean), apply, proxied, pruneOrphans, waitForCerts };
  for (const id of result.ids) {
    ha.nonEmptyString(id, "sync-dns service id must be non-empty");
  }
  assert.nonNegative(result.ids.length, "sync-dns id count must be non-negative");
  assert.ok(typeof result.apply === "boolean", "sync-dns apply must be a boolean");
  assert.ok(typeof result.proxied === "boolean", "sync-dns proxied must be a boolean");
  assert.ok(typeof result.pruneOrphans === "boolean", "sync-dns pruneOrphans must be a boolean");
  assert.ok(typeof result.waitForCerts === "boolean", "sync-dns waitForCerts must be a boolean");
  return result;
}

function servicesFromArgs(config: ServicesConfig, args: Args): readonly DnsTarget[] {
  assert.defined(config, "sync-dns services config must be defined");
  assert.defined(args, "sync-dns args must be defined");
  if (args.ids.length === 0) return allDnsTargets(config);
  const all = allDnsTargets(config);
  const out: DnsTarget[] = [];
  for (const id of args.ids) {
    ha.nonEmptyString(id, "sync-dns service id must be non-empty");
    const s = all.find((x) => x.id === id);
    if (s) {
      out.push(s);
      continue;
    }

    const standalone = config.services.find((service) => service.id === id);
    assert.ok(
      standalone === undefined || typeof standalone === "object",
      "sync-dns standalone lookup must be an object when found",
    );
    if (
      !standalone?.standalone ||
      !standalone.hostname ||
      !isPublicService(standalone) ||
      !railwayIsPublic(standalone)
    ) {
      console.error(`No public service with id "${id}"`);
      process.exit(1);
    }
    assert.nonEmptyString(standalone.hostname, "sync-dns standalone hostname must be non-empty");
    out.push({ id: standalone.id, hostname: standalone.hostname });
  }
  return out;
}

function toDesiredRecords(
  config: ServicesConfig,
  domain: RailwayCustomDomain,
): readonly DesiredRecord[] {
  assert.defined(config, "sync-dns services config must be defined");
  assert.nonEmptyString(config.zone, "sync-dns zone must be non-empty");
  assert.defined(domain, "sync-dns custom domain must be defined");
  assert.nonEmptyString(domain.id, "sync-dns custom domain id must be non-empty");
  const records = railwayDnsRecords(domain, config.zone).map((record) => ({
    type: record.recordType,
    name: record.fqdn,
    content: record.requiredValue,
  }));
  for (const record of records) {
    ha.nonEmptyString(record.name, "sync-dns desired record name must be non-empty");
    ha.nonEmptyString(record.content, "sync-dns desired record content must be non-empty");
  }
  return records;
}

type RailwayDnsContext = Awaited<ReturnType<typeof resolveProjectContext>> & {
  readonly environment: ReturnType<typeof resolveEnvironment>;
};

async function loadRailwayDnsContext(config: ServicesConfig): Promise<RailwayDnsContext> {
  assert.defined(config, "sync-dns services config must be defined");
  const projectName = railwayProjectName(config);
  assert.nonEmptyString(projectName, "sync-dns railway project name must be non-empty");
  const environmentName = railwayEnvironmentName(config);
  assert.nonEmptyString(environmentName, "sync-dns railway environment name must be non-empty");
  const ctx = await resolveProjectContext(projectName, environmentName);
  assert.defined(ctx, "sync-dns railway context must be defined");
  assert.nonEmptyString(ctx.projectId, "sync-dns railway project id must be non-empty");
  return {
    ...ctx,
    environment: resolveEnvironment(ctx.project, environmentName),
  };
}

async function resolveDomainForService(
  config: ServicesConfig,
  service: DnsTarget,
  ctx: RailwayDnsContext,
): Promise<RailwayCustomDomain> {
  assert.defined(config, "sync-dns services config must be defined");
  assert.defined(service, "sync-dns dns target must be defined");
  assert.nonEmptyString(service.id, "sync-dns service id must be non-empty");
  assert.nonEmptyString(service.hostname, "sync-dns service hostname must be non-empty");
  assert.defined(ctx, "sync-dns railway context must be defined");
  const railwayService = findServiceByName(ctx.project, railwayServiceName(config, service.id));
  if (!railwayService) {
    throw new Error(
      `Railway service "${railwayServiceName(config, service.id)}" not found — run provision-railway --apply`,
    );
  }

  const serviceSpec = config.services.find((s) => s.id === service.id);
  assert.ok(
    serviceSpec === undefined || typeof serviceSpec === "object",
    "sync-dns service spec must be an object when present",
  );
  assert.ok(
    serviceSpec?.port === undefined || typeof serviceSpec.port === "number",
    "sync-dns service port must be a number when present",
  );
  return ensureCustomDomain({
    projectId: ctx.projectId,
    environmentId: ctx.environment.id,
    serviceId: railwayService.id,
    domain: service.hostname,
    targetPort: serviceSpec?.port,
  });
}

async function resolveDomainsForServices(
  config: ServicesConfig,
  services: readonly DnsTarget[],
): Promise<Map<string, RailwayCustomDomain>> {
  assert.defined(config, "sync-dns services config must be defined");
  const ctx = await loadRailwayDnsContext(config);
  const domains = new Map<string, RailwayCustomDomain>();

  for (const service of services) {
    ha.nonEmptyString(service.id, "sync-dns service id must be non-empty");
    domains.set(service.id, await resolveDomainForService(config, service, ctx));
  }

  assert.ok(domains instanceof Map, "sync-dns domains must be a Map");
  return domains;
}

type Action =
  | { readonly kind: "create"; readonly record: DesiredRecord }
  | {
      readonly kind: "update";
      readonly record: DesiredRecord;
      readonly recordId: string;
      readonly reason: string;
    }
  | { readonly kind: "delete"; readonly name: string; readonly recordId: string; readonly reason: string }
  | { readonly kind: "ok"; readonly name: string; readonly type: RecordType };

const DESIRED_SSL_MODE = "strict";

async function reconcileSslMode(
  cf: CloudflareApi,
  zoneId: string,
  apply: boolean,
): Promise<void> {
  assert.ok(cf instanceof CloudflareApi, "sync-dns cf client must be a CloudflareApi");
  assert.nonEmptyString(zoneId, "sync-dns zone id must be non-empty");
  assert.ok(typeof apply === "boolean", "sync-dns apply must be a boolean");
  const current = await cf.getZoneSetting(zoneId, "ssl");
  assert.defined(current, "sync-dns ssl setting must be defined");
  const mode = String(current.value);
  assert.nonEmptyString(mode, "sync-dns ssl mode must be non-empty");
  if (mode === DESIRED_SSL_MODE) {
    console.log(`  OK     SSL/TLS mode=${mode}`);
    return;
  }
  const line = `UPDATE SSL/TLS mode: ${mode} → ${DESIRED_SSL_MODE}`;
  if (!apply) {
    console.log(`  [plan] ${line}`);
    return;
  }
  await cf.setZoneSetting(zoneId, "ssl", DESIRED_SSL_MODE);
  console.log(`  [done] ${line}`);
}

function recordKey(record: DesiredRecord, zone: string): string {
  assert.defined(record, "sync-dns desired record must be defined");
  assert.nonEmptyString(record.name, "sync-dns desired record name must be non-empty");
  assert.enum(record.type, ["CNAME", "TXT"], "sync-dns desired record type must be CNAME or TXT");
  assert.nonEmptyString(zone, "sync-dns zone must be non-empty");
  const key = `${normalizeDnsHostname(record.name, zone)}|${record.type}`;
  assert.nonEmptyString(key, "sync-dns record key must be non-empty");
  return key;
}

function cloudflareRecordKey(record: CloudflareDnsRecord, zone: string): string {
  assert.defined(record, "sync-dns cloudflare record must be defined");
  assert.nonEmptyString(record.name, "sync-dns cloudflare record name must be non-empty");
  assert.nonEmptyString(record.type, "sync-dns cloudflare record type must be non-empty");
  assert.nonEmptyString(zone, "sync-dns zone must be non-empty");
  const key = `${normalizeDnsHostname(record.name, zone)}|${record.type.toUpperCase()}`;
  assert.nonEmptyString(key, "sync-dns cloudflare record key must be non-empty");
  return key;
}

function findPrimaryRecord(
  records: readonly CloudflareDnsRecord[],
  target: DesiredRecord,
  zone: string,
): CloudflareDnsRecord | undefined {
  assert.defined(target, "sync-dns desired record must be defined");
  assert.nonEmptyString(target.name, "sync-dns desired record name must be non-empty");
  assert.nonEmptyString(zone, "sync-dns zone must be non-empty");
  const normalized = normalizeDnsHostname(target.name, zone);
  const targetType = target.type.toUpperCase();

  for (const record of records) {
    ha.nonEmptyString(record.name, "sync-dns cloudflare record name must be non-empty");
    ha.string(record.type, "sync-dns cloudflare record type must be a string");
    if (
      normalizeDnsHostname(record.name, zone) === normalized &&
      record.type.toUpperCase() === targetType
    ) {
      return record;
    }
  }

  for (const record of records) {
    ha.nonEmptyString(record.name, "sync-dns cloudflare record name must be non-empty");
    ha.string(record.type, "sync-dns cloudflare record type must be a string");
    if (normalizeDnsHostname(record.name, zone) !== normalized) continue;
    const type = record.type.toUpperCase();
    if (type === "CNAME" || type === "A" || type === "AAAA") return record;
  }

  return undefined;
}

async function planActions(
  records: readonly CloudflareDnsRecord[],
  config: ServicesConfig,
  services: readonly DnsTarget[],
  args: Args,
  domainsByServiceId: ReadonlyMap<string, RailwayCustomDomain>,
): Promise<readonly Action[]> {
  assert.defined(config, "sync-dns services config must be defined");
  assert.nonEmptyString(config.zone, "sync-dns zone must be non-empty");
  assert.defined(args, "sync-dns args must be defined");
  assert.ok(
    domainsByServiceId instanceof Map,
    "sync-dns domains by service id must be a Map",
  );
  const zone = config.zone;
  const byNameType = new Map<string, CloudflareDnsRecord[]>();
  for (const r of records) {
    ha.nonEmptyString(r.id, "sync-dns cloudflare record id must be non-empty");
    const key = cloudflareRecordKey(r, zone);
    const bucket = byNameType.get(key);
    ha.ok(
      bucket === undefined || Array.isArray(bucket),
      "sync-dns record bucket must be an array when present",
    );
    const list = bucket ?? [];
    list.push(r);
    byNameType.set(key, list);
  }

  const actions: Action[] = [];
  const desiredKeys = new Set<string>();

  for (const service of services) {
    ha.nonEmptyString(service.id, "sync-dns service id must be non-empty");
    const domain = domainsByServiceId.get(service.id);
    if (!domain) {
      throw new Error(`Missing Railway custom domain for service "${service.id}"`);
    }
    assert.defined(domain, "sync-dns custom domain must be defined after friendly check");
    const desired = toDesiredRecords(config, domain);
    for (const target of desired) {
      ha.nonEmptyString(target.name, "sync-dns desired record name must be non-empty");
      ha.nonEmptyString(target.content, "sync-dns desired record content must be non-empty");
      desiredKeys.add(recordKey(target, zone));
      const key = recordKey(target, zone);
      const existing = byNameType.get(key) ?? [];

      for (const extra of existing.slice(1)) {
        ha.nonEmptyString(extra.id, "sync-dns duplicate record id must be non-empty");
        actions.push({
          kind: "delete",
          name: extra.name,
          recordId: extra.id,
          reason: `duplicate ${target.type}`,
        });
      }

      const primary = existing[0] ?? findPrimaryRecord(records, target, zone);
      if (!primary) {
        actions.push({ kind: "create", record: target });
        continue;
      }

      if (primary.type.toUpperCase() !== target.type.toUpperCase()) {
        actions.push({
          kind: "delete",
          name: primary.name,
          recordId: primary.id,
          reason: `replace ${primary.type} with ${target.type}`,
        });
        actions.push({ kind: "create", record: target });
        continue;
      }

      if (primary.content !== target.content || primary.proxied !== args.proxied) {
        actions.push({
          kind: "update",
          record: target,
          recordId: primary.id,
          reason: "content/proxied drift",
        });
      } else {
        actions.push({ kind: "ok", name: target.name, type: target.type });
      }
    }
  }

  if (args.pruneOrphans) {
    const originHostname = `origin.${config.zone}`;
    assert.nonEmptyString(originHostname, "sync-dns origin hostname must be non-empty");
    const excludedHostnames = new Set([standaloneVaultHostname(config)]);
    assert.ok(excludedHostnames instanceof Set, "sync-dns excluded hostnames must be a Set");

    for (const r of records) {
      ha.nonEmptyString(r.id, "sync-dns cloudflare record id must be non-empty");
      ha.nonEmptyString(r.name, "sync-dns cloudflare record name must be non-empty");
      if (r.name === originHostname && r.type === "A") {
        actions.push({
          kind: "delete",
          name: r.name,
          recordId: r.id,
          reason: "legacy origin A record (DO droplet)",
        });
      }
      if (!["CNAME", "TXT"].includes(r.type)) continue;
      const key = cloudflareRecordKey(r, zone);
      if (desiredKeys.has(key)) continue;
      const normalized = normalizeDnsHostname(r.name, zone);
      if (excludedHostnames.has(normalized)) continue;
      if (normalized !== zone && !normalized.endsWith(`.${zone}`)) continue;
      if (r.type === "CNAME" && !r.content.includes("railway") && !r.content.endsWith(".fly.dev")) {
        continue;
      }
      actions.push({
        kind: "delete",
        name: r.name,
        recordId: r.id,
        reason: `orphan ${r.type} → ${r.content}`,
      });
    }
  }

  return actions;
}

function summarise(action: Action): string {
  assert.defined(action, "sync-dns action must be defined");
  switch (action.kind) {
    case "create":
      return `CREATE ${action.record.name} ${action.record.type} → ${action.record.content}`;
    case "update":
      return `UPDATE ${action.record.name} ${action.record.type}: ${action.reason}`;
    case "delete":
      return `DELETE ${action.name} (${action.reason})`;
    case "ok":
      return `OK     ${action.name} ${action.type}`;
  }
  assert.fail("unreachable sync-dns action kind");
}

async function applyAction(
  cf: CloudflareApi,
  zoneId: string,
  action: Action,
  args: Args,
  managedComment: string,
): Promise<void> {
  assert.ok(cf instanceof CloudflareApi, "sync-dns cf client must be a CloudflareApi");
  assert.nonEmptyString(zoneId, "sync-dns zone id must be non-empty");
  assert.defined(action, "sync-dns action must be defined");
  assert.defined(args, "sync-dns args must be defined");
  assert.nonEmptyString(managedComment, "sync-dns managed comment must be non-empty");
  switch (action.kind) {
    case "create":
      await cf.createDnsRecord(zoneId, {
        name: action.record.name,
        type: action.record.type,
        content: action.record.content,
        proxied: args.proxied,
        ttl: 1,
        comment: managedComment,
      });
      return;
    case "update":
      assert.nonEmptyString(action.recordId, "sync-dns update record id must be non-empty");
      await cf.updateDnsRecord(zoneId, action.recordId, {
        name: action.record.name,
        type: action.record.type,
        content: action.record.content,
        proxied: args.proxied,
        ttl: 1,
        comment: managedComment,
      });
      return;
    case "delete":
      assert.nonEmptyString(action.recordId, "sync-dns delete record id must be non-empty");
      await cf.deleteDnsRecord(zoneId, action.recordId);
      return;
    case "ok":
      return;
  }
  assert.fail("unreachable sync-dns action kind");
}

async function retryFailedCertificates(
  config: ServicesConfig,
  services: readonly DnsTarget[],
  domainsByServiceId: ReadonlyMap<string, RailwayCustomDomain>,
  apply: boolean,
): Promise<void> {
  assert.defined(config, "sync-dns services config must be defined");
  assert.ok(
    domainsByServiceId instanceof Map,
    "sync-dns domains by service id must be a Map",
  );
  assert.ok(typeof apply === "boolean", "sync-dns apply must be a boolean");
  const ctx = await loadRailwayDnsContext(config);

  for (const service of services) {
    ha.nonEmptyString(service.id, "sync-dns service id must be non-empty");
    ha.nonEmptyString(service.hostname, "sync-dns service hostname must be non-empty");
    const domain = domainsByServiceId.get(service.id);
    if (!domain) continue;

    let status = domain.status.certificateStatus?.toUpperCase() ?? "PENDING";
    if (isCustomDomainCertificateReady(status)) {
      console.log(`  OK     ${service.hostname} certificate ${status}`);
      continue;
    }
    if (!isCustomDomainCertificateFailed(status)) {
      console.log(`  ${service.hostname}: certificate ${status} (not retrying yet)`);
      continue;
    }

    const line = `RETRY  ${service.hostname} certificate ${status} → issue`;
    if (!apply) {
      console.log(`  [plan] ${line}`);
      continue;
    }

    await issueCustomDomainCertificate(domain.id);
    const fresh = await getCustomDomain(domain.id, ctx.projectId);
    status = fresh.status.certificateStatus?.toUpperCase() ?? "PENDING";
    console.log(`  [done] ${line} (now ${status})`);
  }
}

function certificatePollIntervalMs(serviceCount: number): number {
  assert.nonNegativeInteger(serviceCount, "sync-dns service count must be a non-negative integer");
  const result = serviceCount > 5 ? 60_000 : 30_000;
  assert.ok(result > 0, "sync-dns certificate poll interval must be positive", { serviceCount });
  return result;
}

async function waitForCertificates(
  config: ServicesConfig,
  services: readonly DnsTarget[],
  domainsByServiceId: ReadonlyMap<string, RailwayCustomDomain>,
  timeoutMs = 900_000,
): Promise<void> {
  assert.defined(config, "sync-dns services config must be defined");
  assert.ok(
    domainsByServiceId instanceof Map,
    "sync-dns domains by service id must be a Map",
  );
  assert.number(timeoutMs, "sync-dns timeout must be a number");
  assert.ok(timeoutMs > 0, "sync-dns timeout must be positive", { timeoutMs });
  const ctx = await loadRailwayDnsContext(config);
  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = certificatePollIntervalMs(services.length);

  const pending = new Map<string, { readonly hostname: string; readonly domainId: string }>();
  for (const service of services) {
    ha.nonEmptyString(service.id, "sync-dns service id must be non-empty");
    ha.nonEmptyString(service.hostname, "sync-dns service hostname must be non-empty");
    const domain = domainsByServiceId.get(service.id);
    if (!domain) continue;
    pending.set(service.id, { hostname: service.hostname, domainId: domain.id });
  }

  while (Date.now() < deadline && pending.size > 0) {
    for (const [serviceId, target] of [...pending.entries()]) {
      ha.nonEmptyString(serviceId, "sync-dns pending service id must be non-empty");
      ha.nonEmptyString(target.hostname, "sync-dns pending hostname must be non-empty");
      ha.nonEmptyString(target.domainId, "sync-dns pending domain id must be non-empty");
      const fresh = await getCustomDomain(target.domainId, ctx.projectId);
      const status = fresh.status.certificateStatus?.toUpperCase() ?? "PENDING";
      if (isCustomDomainCertificateReady(status)) {
        pending.delete(serviceId);
        console.log(`  OK     ${target.hostname} certificate ${status}`);
        continue;
      }
      console.log(`  ${target.hostname}: certificate ${status}`);
    }

    if (pending.size === 0) {
      console.log("  All custom domain certificates issued");
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (pending.size > 0) {
    throw new Error(
      `Timed out waiting for Railway custom domain certificates (${pending.size} pending)`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assert.defined(args, "sync-dns args must be defined");
  const cfCreds = cloudflareCredentialsFromEnv();
  if (!cfCreds) {
    console.warn("Skipping DNS sync — CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) not set");
    return;
  }
  assert.ok(!!cfCreds, "sync-dns cloudflare credentials must be present after env check", {
    name: "CLOUDFLARE_API_TOKEN",
  });

  await ensureRailwayToken();
  const config = loadServicesConfig();
  assert.defined(config, "sync-dns services config must be defined");
  assert.nonEmptyString(config.zone, "sync-dns zone must be non-empty");
  const services = servicesFromArgs(config, args);
  const managedComment = `managed by infra/scripts/sync-dns.ts (${config.zone})`;
  assert.nonEmptyString(managedComment, "sync-dns managed comment must be non-empty");
  const cf = new CloudflareApi();
  const zone = await cf.findZoneByName(config.zone);
  if (!zone) {
    console.error(`Zone "${config.zone}" not found in Cloudflare account`);
    process.exit(1);
  }
  assert.defined(zone, "sync-dns zone must be defined after friendly check");
  assert.nonEmptyString(zone.id, "sync-dns zone id must be non-empty");

  console.log(
    `Sync DNS (${args.apply ? "APPLY" : "DRY-RUN"}) platform=railway zone=${config.zone} services=${services.length} proxied=${args.proxied}`,
  );

  const domainsByServiceId = await resolveDomainsForServices(config, services);
  assert.ok(
    domainsByServiceId instanceof Map,
    "sync-dns domains by service id must be a Map",
  );
  const records = await cf.listDnsRecords(zone.id);
  const actions = await planActions(records, config, services, args, domainsByServiceId);

  await reconcileSslMode(cf, zone.id, args.apply);

  let changes = 0;
  let errors = 0;
  for (const action of actions) {
    ha.nonEmptyString(action.kind, "sync-dns action kind must be non-empty");
    const line = summarise(action);
    if (action.kind === "ok") {
      console.log(`  ${line}`);
      continue;
    }
    changes += 1;
    if (!args.apply) {
      console.log(`  [plan] ${line}`);
      continue;
    }
    try {
      await applyAction(cf, zone.id, action, args, managedComment);
      console.log(`  [done] ${line}`);
    } catch (err) {
      errors += 1;
      console.error(`  [fail] ${line} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nSummary: changes=${changes}, errors=${errors}`);
  assert.nonNegative(changes, "sync-dns change count must be non-negative");
  assert.nonNegative(errors, "sync-dns error count must be non-negative");
  if (errors > 0) process.exit(1);

  console.log("\nRailway TLS certificates:");
  await retryFailedCertificates(config, services, domainsByServiceId, args.apply);

  if (args.apply && args.waitForCerts) {
    await waitForCertificates(config, services, domainsByServiceId);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
