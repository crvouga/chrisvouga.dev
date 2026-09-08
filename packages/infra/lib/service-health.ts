import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import {
  isAlwaysOn,
  serviceHealthPath,
  type ServiceSpec,
  type ServicesConfig,
} from "./services.js";

export type HttpProbeResult = {
  readonly ok: boolean;
  readonly status: number;
  readonly error?: string;
  readonly fastFail: boolean;
};

/** LB / gateway errors — retrying won't help. */
export function isFastFailHttpStatus(status: number): boolean {
  assert.number(status, "http status must be a number");
  return status === 502 || status === 503 || status === 504;
}

export function serviceHealthUrl(service: ServiceSpec, baseUrl?: string): string | undefined {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (baseUrl !== undefined) assert.nonEmptyString(baseUrl, "base url must be non-empty");
  const path = serviceHealthPath(service);
  if (!path) return undefined;
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  }
  if (!service.hostname) return undefined;
  const url = `https://${service.hostname}${path}`;
  assert.ok(url.startsWith("https://"), "service health url must be https", { url });
  return url;
}

export async function probeHttp(url: string, timeoutMs: number): Promise<HttpProbeResult> {
  assert.nonEmptyString(url, "probe url must be non-empty");
  assert.ok(url.startsWith("http"), "probe url must be http(s)", { url });
  assert.nonNegative(timeoutMs, "probe timeout must be non-negative");
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    assert.ok(res instanceof Response, "probe fetch must return a Response");
    const result = { ok: res.ok, status: res.status, fastFail: isFastFailHttpStatus(res.status) };
    assert.ok(typeof result.ok === "boolean", "probe ok must be a boolean");
    assert.number(result.status, "probe status must be a number");
    return result;
  } catch (err) {
    return {
      ok: false,
      status: 0,
      fastFail: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForServiceHealthy(
  _config: ServicesConfig,
  service: ServiceSpec,
  options?: { readonly baseUrl?: string; readonly acceptStatuses?: readonly number[] },
): Promise<void> {
  assert.record(service, "service spec must be a record");
  assert.nonEmptyString(service.id, "service id must be non-empty");
  if (options?.baseUrl !== undefined) assert.nonEmptyString(options.baseUrl, "base url must be non-empty");
  if (options?.acceptStatuses !== undefined) assert.array(options.acceptStatuses, "acceptStatuses must be an array");
  const url = serviceHealthUrl(service, options?.baseUrl);
  if (!url) return;
  assert.nonEmptyString(url, "service health url must be non-empty");

  const alwaysOn = isAlwaysOn(service);
  const maxWaitMs = alwaysOn ? 60_000 : 120_000;
  const perAttemptMs = alwaysOn ? 15_000 : 30_000;
  const retryDelayMs = 5_000;
  assert.nonNegative(maxWaitMs, "max wait must be non-negative");
  const deadline = Date.now() + maxWaitMs;
  const accept = new Set(options?.acceptStatuses ?? []);

  console.log(`  Waiting for ${service.id} → ${url}`);

  while (Date.now() < deadline) {
    const http = await probeHttp(url, perAttemptMs);
    ha.number(http.status, "probe status must be a number");
    ha.ok(typeof http.ok === "boolean", "probe ok must be a boolean");
    const accepted = http.ok || accept.has(http.status);
    if (accepted) {
      console.log(`  ✓ ${service.id} healthy (HTTP ${http.status})`);
      return;
    }

    const detail = http.error ?? `HTTP ${http.status}`;
    console.log(`  ${service.id} not ready: ${detail}`);
    if (http.fastFail && alwaysOn) {
      throw new Error(`${service.id} unhealthy: ${detail} (${url})`);
    }
    await sleep(retryDelayMs);
  }

  throw new Error(`${service.id} did not become healthy within ${maxWaitMs / 1000}s (${url})`);
}
