/**
 * Typed Cloudflare REST API client.
 * Required env: CLOUDFLARE_API_TOKEN (or CF_API_TOKEN).
 */

export function cloudflareCredentialsFromEnv(): {
  readonly token: string;
  readonly accountId: string;
} | null {
  const token =
    process.env["CLOUDFLARE_API_TOKEN"]?.trim() || process.env["CF_API_TOKEN"]?.trim() || "";
  if (!token) return null;
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim() || "";
  return { token, accountId };
}

const API_BASE = "https://api.cloudflare.com/client/v4";

export type CloudflareErrorEntry = { readonly code: number; readonly message: string };

export type CloudflareResponse<T> = {
  readonly success: boolean;
  readonly errors: readonly CloudflareErrorEntry[];
  readonly messages: readonly CloudflareErrorEntry[];
  readonly result: T;
};

export type CloudflareZone = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
};

export type CloudflareDnsRecord = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly content: string;
  readonly proxied: boolean;
  readonly ttl: number;
  readonly comment?: string | null;
};

export type CloudflareDnsRecordInput = {
  readonly name: string;
  readonly type: "CNAME" | "A" | "AAAA" | "TXT" | "MX";
  readonly content: string;
  readonly proxied?: boolean;
  readonly ttl?: number;
  readonly comment?: string;
};

export type CloudflareRulesetRule = {
  readonly id?: string;
  readonly ref?: string;
  readonly expression: string;
  readonly description?: string;
  readonly enabled?: boolean;
  readonly action: string;
  readonly action_parameters?: Record<string, unknown>;
};

export type CloudflareRuleset = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly phase: string;
  readonly rules: readonly CloudflareRulesetRule[];
};

export class CloudflareApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly errors: readonly CloudflareErrorEntry[],
  ) {
    super(
      `Cloudflare API ${method} ${path} failed (HTTP ${status}): ${
        errors.map((e) => `[${e.code}] ${e.message}`).join("; ") || "unknown error"
      }`,
    );
    this.name = "CloudflareApiError";
  }
}

export class CloudflareApi {
  private readonly token: string;

  constructor(
    token: string =
      process.env["CLOUDFLARE_API_TOKEN"]?.trim() ||
      process.env["CF_API_TOKEN"]?.trim() ||
      "",
  ) {
    if (!token) {
      throw new Error("CLOUDFLARE_API_TOKEN is required.");
    }
    this.token = token;
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${path}`, init);
    const text = await res.text();
    let parsed: CloudflareResponse<T>;
    try {
      parsed = JSON.parse(text) as CloudflareResponse<T>;
    } catch {
      throw new Error(`Cloudflare API ${method} ${path} returned non-JSON (HTTP ${res.status})`);
    }
    if (!parsed.success) {
      throw new CloudflareApiError(method, path, res.status, parsed.errors);
    }
    return parsed.result;
  }

  async findZoneByName(zoneName: string): Promise<CloudflareZone | null> {
    const result = await this.request<readonly CloudflareZone[]>(
      "GET",
      `/zones?name=${encodeURIComponent(zoneName)}`,
    );
    return result[0] ?? null;
  }

  async listDnsRecords(zoneId: string): Promise<readonly CloudflareDnsRecord[]> {
    const out: CloudflareDnsRecord[] = [];
    let page = 1;
    for (;;) {
      const result = await this.request<readonly CloudflareDnsRecord[]>(
        "GET",
        `/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100&page=${page}`,
      );
      out.push(...result);
      if (result.length < 100) break;
      page += 1;
    }
    return out;
  }

  async createDnsRecord(
    zoneId: string,
    record: CloudflareDnsRecordInput,
  ): Promise<CloudflareDnsRecord> {
    return this.request<CloudflareDnsRecord>(
      "POST",
      `/zones/${encodeURIComponent(zoneId)}/dns_records`,
      record,
    );
  }

  async updateDnsRecord(
    zoneId: string,
    recordId: string,
    record: CloudflareDnsRecordInput,
  ): Promise<CloudflareDnsRecord> {
    return this.request<CloudflareDnsRecord>(
      "PUT",
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
      record,
    );
  }

  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.request<{ id: string }>(
      "DELETE",
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
    );
  }

  async getZoneSetting(zoneId: string, setting: string): Promise<{ readonly id: string; readonly value: unknown }> {
    return this.request<{ id: string; value: unknown }>(
      "GET",
      `/zones/${encodeURIComponent(zoneId)}/settings/${encodeURIComponent(setting)}`,
    );
  }

  async setZoneSetting(
    zoneId: string,
    setting: string,
    value: unknown,
  ): Promise<{ readonly id: string; readonly value: unknown }> {
    return this.request<{ id: string; value: unknown }>(
      "PATCH",
      `/zones/${encodeURIComponent(zoneId)}/settings/${encodeURIComponent(setting)}`,
      { value },
    );
  }

  async getRulesetPhaseEntrypoint(
    zoneId: string,
    phase: string,
  ): Promise<CloudflareRuleset | null> {
    try {
      return await this.request<CloudflareRuleset>(
        "GET",
        `/zones/${encodeURIComponent(zoneId)}/rulesets/phases/${encodeURIComponent(phase)}/entrypoint`,
      );
    } catch (err) {
      if (err instanceof CloudflareApiError && err.status === 404) return null;
      throw err;
    }
  }

  async createRuleset(
    zoneId: string,
    body: {
      readonly name: string;
      readonly kind: "zone";
      readonly phase: string;
      readonly rules: readonly CloudflareRulesetRule[];
    },
  ): Promise<CloudflareRuleset> {
    return this.request<CloudflareRuleset>(
      "POST",
      `/zones/${encodeURIComponent(zoneId)}/rulesets`,
      body,
    );
  }

  async updateRuleset(
    zoneId: string,
    rulesetId: string,
    body: {
      readonly name: string;
      readonly kind: "zone";
      readonly phase: string;
      readonly rules: readonly CloudflareRulesetRule[];
    },
  ): Promise<CloudflareRuleset> {
    return this.request<CloudflareRuleset>(
      "PUT",
      `/zones/${encodeURIComponent(zoneId)}/rulesets/${encodeURIComponent(rulesetId)}`,
      body,
    );
  }
}
