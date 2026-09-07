#!/usr/bin/env bun
/**
 * HTTP health-check for public services in services.yaml.
 *
 * Usage:
 *   bun run scripts/health-check-urls.ts
 *   bun run scripts/health-check-urls.ts --id snake-game
 *   bun run scripts/health-check-urls.ts --all-public
 */
import { probeHttp, serviceHealthUrl } from "../lib/service-health.js";
import {
  deployableServices,
  isAlwaysOn,
  isPublicService,
  loadServicesConfig,
  type ServiceSpec,
  type ServicesConfig,
} from "../lib/services.js";

type Args = {
  readonly ids: readonly string[];
  readonly allPublic: boolean;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly retryDelayMs: number;
  readonly coldStartTimeoutMs: number;
  readonly baseUrl?: string;
};

function parseArgs(argv: readonly string[]): Args {
  const ids: string[] = [];
  let allPublic = false;
  let timeoutMs = 15_000;
  let coldStartTimeoutMs = 45_000;
  let retries = 1;
  let retryDelayMs = 3_000;
  let baseUrl: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--all-public") allPublic = true;
    else if (arg === "--timeout-ms") timeoutMs = Number(argv[++i] ?? timeoutMs);
    else if (arg === "--cold-start-timeout-ms")
      coldStartTimeoutMs = Number(argv[++i] ?? coldStartTimeoutMs);
    else if (arg === "--retries") retries = Number(argv[++i] ?? retries);
    else if (arg === "--retry-delay-ms") retryDelayMs = Number(argv[++i] ?? retryDelayMs);
    else if (arg === "--base-url") baseUrl = argv[++i] ?? baseUrl;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/health-check-urls.ts [--id <id> ...] [--all-public] [--base-url <url>] [--timeout-ms <ms>] [--cold-start-timeout-ms <ms>] [--retries <n>]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return {
    ids: ids.filter(Boolean),
    allPublic,
    timeoutMs,
    coldStartTimeoutMs,
    retries,
    retryDelayMs,
    baseUrl,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function healthCheckServices(config: ServicesConfig, args: Args): readonly ServiceSpec[] {
  const pool = args.allPublic ? deployableServices(config) : config.services;
  return pool.filter((service) => {
    if (!service.health_check || !isPublicService(service) || !service.hostname) return false;
    if (args.ids.length > 0) return args.ids.includes(service.id);
    if (args.allPublic) return true;
    return isAlwaysOn(service);
  });
}

async function checkWithRetries(
  service: ServiceSpec,
  args: Args,
): Promise<{ ok: boolean; error?: string }> {
  const url = serviceHealthUrl(service, args.baseUrl);
  if (!url) return { ok: true };

  const perAttemptTimeout = isAlwaysOn(service) ? args.timeoutMs : args.coldStartTimeoutMs;
  const max = args.retries + 1;

  for (let attempt = 1; attempt <= max; attempt++) {
    const http = await probeHttp(url, perAttemptTimeout);
    const accepted = http.ok;
    if (accepted) {
      console.log(`  ✓ ${service.id} ${url} (HTTP ${http.status}) attempt ${attempt}/${max}`);
      return { ok: true };
    }

    const err = http.error ?? `HTTP ${http.status}`;
    console.log(`  ✗ ${service.id} attempt ${attempt}/${max}: ${err}`);
    if (http.fastFail && isAlwaysOn(service)) return { ok: false, error: err };
    if (attempt < max) await sleep(args.retryDelayMs);
    else return { ok: false, error: err };
  }

  return { ok: false, error: "exhausted retries" };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadServicesConfig();
  const services = healthCheckServices(config, args);

  if (services.length === 0) {
    console.log("No services to health-check");
    return;
  }

  console.log(`\nHealth check: ${services.length} service(s)\n`);
  const failed: string[] = [];

  for (const service of services) {
    const url = serviceHealthUrl(service, args.baseUrl);
    console.log(`Checking ${service.id} → ${url}`);
    const result = await checkWithRetries(service, args);
    if (!result.ok) failed.push(`${service.id}: ${result.error}`);
  }

  if (failed.length > 0) {
    console.error(`\n❌ ${failed.length} service(s) failed:\n${failed.map((f) => `  • ${f}`).join("\n")}`);
    process.exit(1);
  }

  console.log("\n✅ All services healthy");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
