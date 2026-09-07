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
  const ids: string[] = [];
  let apply = false;
  let proxied = false;
  let pruneOrphans = true;
  let waitForCerts = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--apply") apply = true;
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

  return { ids: ids.filter(Boolean), apply, proxied, pruneOrphans, waitForCerts };
}

function servicesFromArgs(config: ServicesConfig, args: Args): readonly DnsTarget[] {
  if (args.ids.length === 0) return allDnsTargets(config);
  const all = allDnsTargets(config);
  const out: DnsTarget[] = [];
  for (const id of args.ids) {
    const s = all.find((x) => x.id === id);
    if (s) {
      out.push(s);
      continue;
    }

    const standalone = config.services.find((service) => service.id === id);
    if (
      !standalone?.standalone ||
      !standalone.hostname ||
      !isPublicService(standalone) ||
      !railwayIsPublic(standalone)
    ) {
      console.error(`No public service with id "${id}"`);
      process.exit(1);
    }
    out.push({ id: standalone.id, hostname: standalone.hostname });
  }
  return out;
}

function toDesiredRecords(
  config: ServicesConfig,
  domain: RailwayCustomDomain,
): readonly DesiredRecord[] {
  return railwayDnsRecords(domain, config.zone).map((record) => ({
    type: record.recordType,
    name: record.fqdn,
    content: record.requiredValue,
  }));
}

type RailwayDnsContext = Awaited<ReturnType<typeof resolveProjectContext>> & {
  readonly environment: ReturnType<typeof resolveEnvironment>;
};

async function loadRailwayDnsContext(config: ServicesConfig): Promise<RailwayDnsContext> {
  const projectName = railwayProjectName(config);
  const environmentName = railwayEnvironmentName(config);
  const ctx = await resolveProjectContext(projectName, environmentName);
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
  const railwayService = findServiceByName(ctx.project, railwayServiceName(config, service.id));
  if (!railwayService) {
    throw new Error(
      `Railway service "${railwayServiceName(config, service.id)}" not found — run provision-railway --apply`,
    );
  }

  const serviceSpec = config.services.find((s) => s.id === service.id);
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
  const ctx = await loadRailwayDnsContext(config);
  const domains = new Map<string, RailwayCustomDomain>();

  for (const service of services) {
    domains.set(service.id, await resolveDomainForService(config, service, ctx));
  }

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
  const current = await cf.getZoneSetting(zoneId, "ssl");
  const mode = String(current.value);
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
  return `${normalizeDnsHostname(record.name, zone)}|${record.type}`;
}

function cloudflareRecordKey(record: CloudflareDnsRecord, zone: string): string {
  return `${normalizeDnsHostname(record.name, zone)}|${record.type.toUpperCase()}`;
}

function findPrimaryRecord(
  records: readonly CloudflareDnsRecord[],
  target: DesiredRecord,
  zone: string,
): CloudflareDnsRecord | undefined {
  const normalized = normalizeDnsHostname(target.name, zone);
  const targetType = target.type.toUpperCase();

  for (const record of records) {
    if (
      normalizeDnsHostname(record.name, zone) === normalized &&
      record.type.toUpperCase() === targetType
    ) {
      return record;
    }
  }

  for (const record of records) {
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
  const zone = config.zone;
  const byNameType = new Map<string, CloudflareDnsRecord[]>();
  for (const r of records) {
    const key = cloudflareRecordKey(r, zone);
    const list = byNameType.get(key) ?? [];
    list.push(r);
    byNameType.set(key, list);
  }

  const actions: Action[] = [];
  const desiredKeys = new Set<string>();

  for (const service of services) {
    const domain = domainsByServiceId.get(service.id);
    if (!domain) {
      throw new Error(`Missing Railway custom domain for service "${service.id}"`);
    }
    const desired = toDesiredRecords(config, domain);
    for (const target of desired) {
      desiredKeys.add(recordKey(target, zone));
      const key = recordKey(target, zone);
      const existing = byNameType.get(key) ?? [];

      for (const extra of existing.slice(1)) {
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
    const excludedHostnames = new Set([standaloneVaultHostname(config)]);

    for (const r of records) {
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
}

async function applyAction(
  cf: CloudflareApi,
  zoneId: string,
  action: Action,
  args: Args,
  managedComment: string,
): Promise<void> {
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
      await cf.deleteDnsRecord(zoneId, action.recordId);
      return;
    case "ok":
      return;
  }
}

async function retryFailedCertificates(
  config: ServicesConfig,
  services: readonly DnsTarget[],
  domainsByServiceId: ReadonlyMap<string, RailwayCustomDomain>,
  apply: boolean,
): Promise<void> {
  const ctx = await loadRailwayDnsContext(config);

  for (const service of services) {
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
  return serviceCount > 5 ? 60_000 : 30_000;
}

async function waitForCertificates(
  config: ServicesConfig,
  services: readonly DnsTarget[],
  domainsByServiceId: ReadonlyMap<string, RailwayCustomDomain>,
  timeoutMs = 900_000,
): Promise<void> {
  const ctx = await loadRailwayDnsContext(config);
  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = certificatePollIntervalMs(services.length);

  const pending = new Map<string, { readonly hostname: string; readonly domainId: string }>();
  for (const service of services) {
    const domain = domainsByServiceId.get(service.id);
    if (!domain) continue;
    pending.set(service.id, { hostname: service.hostname, domainId: domain.id });
  }

  while (Date.now() < deadline && pending.size > 0) {
    for (const [serviceId, target] of [...pending.entries()]) {
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
  const cfCreds = cloudflareCredentialsFromEnv();
  if (!cfCreds) {
    console.warn("Skipping DNS sync — CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) not set");
    return;
  }

  await ensureRailwayToken();
  const config = loadServicesConfig();
  const services = servicesFromArgs(config, args);
  const managedComment = `managed by infra/scripts/sync-dns.ts (${config.zone})`;
  const cf = new CloudflareApi();
  const zone = await cf.findZoneByName(config.zone);
  if (!zone) {
    console.error(`Zone "${config.zone}" not found in Cloudflare account`);
    process.exit(1);
  }

  console.log(
    `Sync DNS (${args.apply ? "APPLY" : "DRY-RUN"}) platform=railway zone=${config.zone} services=${services.length} proxied=${args.proxied}`,
  );

  const domainsByServiceId = await resolveDomainsForServices(config, services);
  const records = await cf.listDnsRecords(zone.id);
  const actions = await planActions(records, config, services, args, domainsByServiceId);

  await reconcileSslMode(cf, zone.id, args.apply);

  let changes = 0;
  let errors = 0;
  for (const action of actions) {
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
