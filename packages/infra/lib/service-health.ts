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
  return status === 502 || status === 503 || status === 504;
}

export function serviceHealthUrl(service: ServiceSpec, baseUrl?: string): string | undefined {
  const path = serviceHealthPath(service);
  if (!path) return undefined;
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  }
  if (!service.hostname) return undefined;
  return `https://${service.hostname}${path}`;
}

export async function probeHttp(url: string, timeoutMs: number): Promise<HttpProbeResult> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: res.ok, status: res.status, fastFail: isFastFailHttpStatus(res.status) };
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
  const url = serviceHealthUrl(service, options?.baseUrl);
  if (!url) return;

  const alwaysOn = isAlwaysOn(service);
  const maxWaitMs = alwaysOn ? 60_000 : 120_000;
  const perAttemptMs = alwaysOn ? 15_000 : 30_000;
  const retryDelayMs = 5_000;
  const deadline = Date.now() + maxWaitMs;
  const accept = new Set(options?.acceptStatuses ?? []);

  console.log(`  Waiting for ${service.id} → ${url}`);

  while (Date.now() < deadline) {
    const http = await probeHttp(url, perAttemptMs);
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
