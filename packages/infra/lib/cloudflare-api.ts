/**
 * Typed Cloudflare REST API client.
 * Required env: CLOUDFLARE_API_TOKEN (or CF_API_TOKEN).
 */
import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();

export function cloudflareCredentialsFromEnv(): {
  readonly token: string;
  readonly accountId: string;
} | null {
  const token =
    process.env["CLOUDFLARE_API_TOKEN"]?.trim() || process.env["CF_API_TOKEN"]?.trim() || "";
  if (!token) return null;
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim() || "";
  const creds = { token, accountId };
  assert.nonEmptyString(creds.token, "cloudflare token must be non-empty");
  assert.string(creds.accountId, "cloudflare accountId must be a string");
  return creds;
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
    assert.nonEmptyString(method, "cloudflare error method must be non-empty");
    assert.nonEmptyString(path, "cloudflare error path must be non-empty");
    assert.number(status, "cloudflare error status must be a number");
    assert.array(errors, "cloudflare error entries must be an array");
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
    assert.nonEmptyString(token, "CLOUDFLARE_API_TOKEN is required");
    this.token = token;
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    assert.enum(method, ["GET", "POST", "PUT", "PATCH", "DELETE"], "cloudflare method must be a known verb");
    assert.nonEmptyString(path, "cloudflare path must be non-empty");
    assert.ok(path.startsWith("/"), "cloudflare path must start with /", { path });
    assert.ok(API_BASE.startsWith("https://"), "cloudflare api base must be https");
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
    assert.nonEmptyString(zoneName, "zone name must be non-empty");
    const result = await this.request<readonly CloudflareZone[]>(
      "GET",
      `/zones?name=${encodeURIComponent(zoneName)}`,
    );
    assert.array(result, "cloudflare zones result must be an array");
    const zone = result[0] ?? null;
    if (zone !== null) {
      assert.record(zone, "cloudflare zone must be a record");
      assert.nonEmptyString(zone.id, "cloudflare zone id must be non-empty");
      assert.nonEmptyString(zone.name, "cloudflare zone name must be non-empty");
    }
    return zone;
  }

  async listDnsRecords(zoneId: string): Promise<readonly CloudflareDnsRecord[]> {
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    const out: CloudflareDnsRecord[] = [];
    let page = 1;
    for (;;) {
      ha.ok(page >= 1, "cloudflare dns page must be >= 1", { page });
      const result = await this.request<readonly CloudflareDnsRecord[]>(
        "GET",
        `/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100&page=${page}`,
      );
      ha.array(result, "cloudflare dns page must be an array");
      for (const record of result) {
        ha.nonEmptyString(record.id, "cloudflare dns record id must be non-empty");
      }
      out.push(...result);
      if (result.length < 100) break;
      page += 1;
    }
    assert.array(out, "cloudflare dns records must be an array");
    return out;
  }

  async createDnsRecord(
    zoneId: string,
    record: CloudflareDnsRecordInput,
  ): Promise<CloudflareDnsRecord> {
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    assert.record(record, "dns record input must be a record");
    assert.nonEmptyString(record.name, "dns record name must be non-empty");
    assert.nonEmptyString(record.content, "dns record content must be non-empty");
    const created = await this.request<CloudflareDnsRecord>(
      "POST",
      `/zones/${encodeURIComponent(zoneId)}/dns_records`,
      record,
    );
    assert.record(created, "created dns record must be a record");
    assert.nonEmptyString(created.id, "created dns record id must be non-empty");
    return created;
  }

  async updateDnsRecord(
    zoneId: string,
    recordId: string,
    record: CloudflareDnsRecordInput,
  ): Promise<CloudflareDnsRecord> {
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    assert.nonEmptyString(recordId, "dns record id must be non-empty");
    assert.record(record, "dns record input must be a record");
    assert.nonEmptyString(record.name, "dns record name must be non-empty");
    const updated = await this.request<CloudflareDnsRecord>(
      "PUT",
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
      record,
    );
    assert.record(updated, "updated dns record must be a record");
    assert.nonEmptyString(updated.id, "updated dns record id must be non-empty");
    return updated;
  }

  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    assert.nonEmptyString(recordId, "dns record id must be non-empty");
    await this.request<{ id: string }>(
      "DELETE",
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
    );
  }

  async getZoneSetting(zoneId: string, setting: string): Promise<{ readonly id: string; readonly value: unknown }> {
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    assert.nonEmptyString(setting, "zone setting must be non-empty");
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
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    assert.nonEmptyString(setting, "zone setting must be non-empty");
    assert.defined(value, "zone setting value must be defined");
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
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    assert.nonEmptyString(phase, "ruleset phase must be non-empty");
    try {
      const ruleset = await this.request<CloudflareRuleset>(
        "GET",
        `/zones/${encodeURIComponent(zoneId)}/rulesets/phases/${encodeURIComponent(phase)}/entrypoint`,
      );
      assert.record(ruleset, "ruleset must be a record");
      assert.nonEmptyString(ruleset.id, "ruleset id must be non-empty");
      return ruleset;
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
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    assert.record(body, "ruleset body must be a record");
    assert.nonEmptyString(body.name, "ruleset name must be non-empty");
    assert.nonEmptyString(body.phase, "ruleset phase must be non-empty");
    assert.array(body.rules, "ruleset rules must be an array");
    const ruleset = await this.request<CloudflareRuleset>(
      "POST",
      `/zones/${encodeURIComponent(zoneId)}/rulesets`,
      body,
    );
    assert.record(ruleset, "created ruleset must be a record");
    assert.nonEmptyString(ruleset.id, "created ruleset id must be non-empty");
    return ruleset;
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
    assert.nonEmptyString(zoneId, "zone id must be non-empty");
    assert.nonEmptyString(rulesetId, "ruleset id must be non-empty");
    assert.record(body, "ruleset body must be a record");
    assert.nonEmptyString(body.name, "ruleset name must be non-empty");
    assert.array(body.rules, "ruleset rules must be an array");
    const ruleset = await this.request<CloudflareRuleset>(
      "PUT",
      `/zones/${encodeURIComponent(zoneId)}/rulesets/${encodeURIComponent(rulesetId)}`,
      body,
    );
    assert.record(ruleset, "updated ruleset must be a record");
    assert.nonEmptyString(ruleset.id, "updated ruleset id must be non-empty");
    return ruleset;
  }
}
