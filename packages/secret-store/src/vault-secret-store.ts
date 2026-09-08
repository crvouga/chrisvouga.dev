import { assert, hotAssert, type Assert } from '@pkgs/assert';
import type { SecretString } from '@pkgs/secret-string/secret-string';
import {
  SecretBlankError,
  SecretMissingError,
  SecretStoreParseError,
  SecretStoreRequestError,
} from './errors';
import type {
  SecretStore,
  SecretStoreGetInit,
  SecretStoreSetInit,
} from './interface';
import { wrapSecret, wrapSecretOptional } from './wrap-secret';

const DEFAULT_ADDR = 'https://vault.chrisvouga.dev';
const DEFAULT_MOUNT = 'secret';

export type VaultSecretStoreOptions = {
  token: string;
  /** Vault API address. @default https://vault.chrisvouga.dev */
  addr?: string;
  /** KV v2 mount path. @default secret */
  mount?: string;
  /** Project slug (e.g. `personal`). Required. */
  project: string;
  /** Config name (e.g. `dev`, `prd`). Required. */
  config: string;
  /** @default globalThis.fetch */
  fetchFn?: VaultFetch;
  /**
   * On HTTP 429 (rate-limited), retry up to this many extra attempts honoring
   * the `Retry-After` response header (seconds; falls back to exponential
   * backoff capped at 5s). `0` disables retries (test-friendly default).
   * @default 3
   */
  rateLimitRetries?: number;
  /** Sleep helper, swappable for tests. @default `setTimeout` */
  sleep?: (ms: number) => Promise<void>;
};

type VaultFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const defaultFetch: VaultFetch = (input, init) => globalThis.fetch(input, init);

function assertNonBlankName(name: string): void {
  assert.string(name, 'Vault: secret name must be a string');
  if (name.length === 0) {
    throw new SecretStoreRequestError('Secret name must be non-empty');
  }
}

type ParsedSecret = 'missing' | 'blank' | { readonly value: string };

function parseSecret(
  body: Record<string, unknown>,
  name: string
): ParsedSecret {
  assert.record(body, 'parseSecret: body must be an object');
  assert.nonEmptyString(name, 'parseSecret: name must be non-empty');
  if (!(name in body)) {
    return 'missing';
  }
  const raw = body[name];
  if (raw === null || raw === undefined) {
    return 'blank';
  }
  if (typeof raw !== 'string') {
    return 'blank';
  }
  assert.string(raw, 'parseSecret: raw must be a string here');
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 'blank';
  }
  return { value: trimmed };
}

function trimOpt(value: string | undefined): string | null {
  assert.ok(
    value === undefined || typeof value === 'string',
    'trimOpt: value must be a string or undefined'
  );
  if (value === undefined) return null;
  const t = value.trim();
  if (t.length === 0) return null;
  assert.nonEmptyString(t, 'trimOpt: trimmed value must be non-empty here');
  return t;
}

const DEFAULT_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_CAP_MS = 5_000;
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseRetryAfterMs(header: string | null): number | null {
  assert.ok(
    header === null || typeof header === 'string',
    'parseRetryAfterMs: header must be a string or null'
  );
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const ms = Math.min(Math.round(seconds * 1000), RATE_LIMIT_BACKOFF_CAP_MS);
  assert.nonNegativeInteger(
    ms,
    'parseRetryAfterMs: result must be a non-negative integer'
  );
  return ms;
}

type KvV2Response = {
  data?: {
    data?: Record<string, unknown>;
  };
};

function parseKvDataObject(json: unknown): Record<string, unknown> {
  assert.defined(json, 'parseKvDataObject: body must be defined');
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new SecretStoreParseError('Vault KV read: expected JSON object body');
  }
  const data = (json as KvV2Response).data?.data;
  if (data === undefined || data === null) {
    throw new SecretStoreParseError(
      'Vault KV read: expected .data.data object in response'
    );
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new SecretStoreParseError(
      'Vault KV read: .data.data must be an object'
    );
  }
  assert.record(data, 'parseKvDataObject: .data.data must be an object here');
  return data;
}

async function readVaultKvBody(
  response: Response,
  path: string
): Promise<Record<string, unknown>> {
  assert.defined(response, 'readVaultKvBody: response is required');
  assert.nonEmptyString(path, 'readVaultKvBody: path must be non-empty');
  assert.integer(response.status, 'readVaultKvBody: status must be an integer');
  if (response.status === 404) {
    throw new SecretStoreRequestError(
      `Vault KV read failed: secret not found at ${path}`,
      404
    );
  }
  // HTTP 530 = node removed from HA cluster. Retry a few times as this can be transient.
  if (response.status === 530) {
    throw new SecretStoreRequestError(
      `Vault KV read failed: node removed from HA cluster (HTTP 530). Check Vault cluster health and ensure the client is routed to an active/healthy standby node.`,
      530
    );
  }
  if (!response.ok) {
    throw new SecretStoreRequestError(
      `Vault KV read failed: HTTP ${response.status}`,
      response.status
    );
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new SecretStoreParseError(
      'Vault KV read: response body is not valid JSON'
    );
  }
  assert.defined(json, 'readVaultKvBody: parsed body must be defined');
  return parseKvDataObject(json);
}

type NormalizedVaultOptions = {
  token: string;
  addr: string;
  mount: string;
  project: string;
  config: string;
  fetchFn: VaultFetch;
  rateLimitRetries: number;
  sleep: (ms: number) => Promise<void>;
};

function normalizeRateLimitRetries(value: number | undefined): number {
  assert.ok(
    value === undefined || typeof value === 'number',
    'Vault: rateLimitRetries must be a number when provided'
  );
  const retries =
    value !== undefined
      ? Math.max(0, Math.floor(value))
      : DEFAULT_RATE_LIMIT_RETRIES;
  assert.nonNegativeInteger(
    retries,
    'Vault: rateLimitRetries must be a non-negative integer'
  );
  return retries;
}

function normalizeVaultOptions(
  options: VaultSecretStoreOptions
): NormalizedVaultOptions {
  assert.string(options.token, 'Vault: token must be a string');
  assert.ok(
    options.addr === undefined || typeof options.addr === 'string',
    'Vault: addr must be a string when provided'
  );
  assert.ok(
    options.mount === undefined || typeof options.mount === 'string',
    'Vault: mount must be a string when provided'
  );
  const token = options.token.trim();
  if (token.length === 0) {
    throw new SecretStoreRequestError(
      'Vault: token is required (non-empty string)'
    );
  }
  const project = trimOpt(options.project);
  const config = trimOpt(options.config);
  if (project === null || config === null) {
    throw new SecretStoreRequestError(
      'Vault: project and config are required (non-empty strings)'
    );
  }
  assert.nonEmptyString(DEFAULT_ADDR, 'Vault: DEFAULT_ADDR must be non-empty');
  assert.nonEmptyString(
    DEFAULT_MOUNT,
    'Vault: DEFAULT_MOUNT must be non-empty'
  );
  const addr = trimOpt(options.addr) ?? DEFAULT_ADDR;
  const mount = trimOpt(options.mount) ?? DEFAULT_MOUNT;
  assert.defined(defaultFetch, 'Vault: defaultFetch must be set');
  assert.defined(defaultSleep, 'Vault: defaultSleep must be set');
  const fetchFn = options.fetchFn ?? defaultFetch;
  const rateLimitRetries = normalizeRateLimitRetries(options.rateLimitRetries);
  const sleep = options.sleep ?? defaultSleep;
  return {
    token,
    addr,
    mount,
    project,
    config,
    fetchFn,
    rateLimitRetries,
    sleep,
  };
}

/**
 * OpenBao/Vault KV v2 HTTP reader. Fetches the whole secret path once and
 * serves individual keys from the cached payload.
 */
export class VaultSecretStore implements SecretStore {
  private readonly token: string;
  private readonly addr: string;
  private readonly mount: string;
  private readonly project: string;
  private readonly config: string;
  private readonly fetchFn: VaultFetch;
  private readonly rateLimitRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private cachedBody: Record<string, ParsedSecret> | null = null;
  private inflightDownload: Promise<Record<string, ParsedSecret>> | null = null;

  constructor(options: VaultSecretStoreOptions) {
    assert.record(options, 'Vault: options must be an object');
    const normalized = normalizeVaultOptions(options);
    this.token = normalized.token;
    this.addr = normalized.addr;
    this.mount = normalized.mount;
    this.project = normalized.project;
    this.config = normalized.config;
    this.fetchFn = normalized.fetchFn;
    this.rateLimitRetries = normalized.rateLimitRetries;
    this.sleep = normalized.sleep;
    assert.equals(this.token, normalized.token, 'Vault: token invariant');
    assert.equals(this.project, normalized.project, 'Vault: project invariant');
    assert.equals(this.config, normalized.config, 'Vault: config invariant');
    assert.defined(this.fetchFn, 'Vault: fetchFn must be set');
    assert.defined(this.sleep, 'Vault: sleep must be set');
  }

  kvDataPath(): string {
    const path = `${this.addr.replace(/\/$/, '')}/v1/${this.mount}/data/${this.project}/${this.config}`;
    assert.nonEmptyString(path, 'kvDataPath: path must be non-empty');
    return path;
  }

  async getRequired(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString> {
    assertNonBlankName(name);
    const row = await this.downloadSecretRow(init);
    return wrapSecret(name, this.requiredFromRow(row, name));
  }

  async getOptional(
    name: string,
    init?: SecretStoreGetInit
  ): Promise<SecretString | null> {
    assertNonBlankName(name);
    const row = await this.downloadSecretRow(init);
    return wrapSecretOptional(name, this.optionalFromRow(row, name));
  }

  async getRequiredMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString>> {
    assert.array(names, 'getRequiredMany: names must be an array');
    if (names.length === 0) {
      return {};
    }
    const haRequired: Assert = hotAssert();
    for (const n of names) {
      haRequired.nonEmptyString(n, 'getRequiredMany: name must be non-empty');
      assertNonBlankName(n);
    }
    const row = await this.downloadSecretRow(init);
    const out: Record<string, SecretString> = {};
    for (const name of names) {
      haRequired.nonEmptyString(
        name,
        'getRequiredMany: name must be non-empty'
      );
      out[name] = wrapSecret(name, this.requiredFromRow(row, name));
    }
    assert.equals(
      Object.keys(out).length,
      names.length,
      'getRequiredMany: one entry per name'
    );
    return out;
  }

  async getOptionalMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString | null>> {
    assert.array(names, 'getOptionalMany: names must be an array');
    if (names.length === 0) {
      return {};
    }
    const haOptional: Assert = hotAssert();
    for (const n of names) {
      haOptional.nonEmptyString(n, 'getOptionalMany: name must be non-empty');
      assertNonBlankName(n);
    }
    const row = await this.downloadSecretRow(init);
    const out: Record<string, SecretString | null> = {};
    for (const name of names) {
      haOptional.nonEmptyString(
        name,
        'getOptionalMany: name must be non-empty'
      );
      out[name] = wrapSecretOptional(name, this.optionalFromRow(row, name));
    }
    assert.equals(
      Object.keys(out).length,
      names.length,
      'getOptionalMany: one entry per name'
    );
    return out;
  }

  /**
   * KV v2 HTTP read is read-only — use {@link VaultCli} for writes from scripts.
   */
  async setSecret(
    name: string,
    _value: string,
    _init?: SecretStoreSetInit
  ): Promise<void> {
    assert.nonEmptyString(name, 'setSecret: name must be non-empty');
    throw new SecretStoreRequestError(
      `VaultSecretStore is HTTP-read-only; cannot setSecret("${name}"). ` +
        'For Bun/Node scripts use VaultCli.kvPatch/kvPut.'
    );
  }

  private requiredFromRow(
    row: Record<string, ParsedSecret>,
    name: string
  ): string {
    assert.record(row, 'requiredFromRow: row must be an object');
    assert.nonEmptyString(name, 'requiredFromRow: name must be non-empty');
    const p = row[name];
    if (p === undefined || p === 'missing') {
      throw new SecretMissingError(name);
    }
    if (p === 'blank') {
      throw new SecretBlankError(name);
    }
    assert.record(p, 'requiredFromRow: entry must be a value here');
    assert.string(p.value, 'requiredFromRow: value must be a string');
    return p.value;
  }

  private optionalFromRow(
    row: Record<string, ParsedSecret>,
    name: string
  ): string | null {
    assert.record(row, 'optionalFromRow: row must be an object');
    assert.nonEmptyString(name, 'optionalFromRow: name must be non-empty');
    const p = row[name];
    if (p === undefined || p === 'missing' || p === 'blank') {
      return null;
    }
    assert.record(p, 'optionalFromRow: entry must be a value here');
    assert.string(p.value, 'optionalFromRow: value must be a string');
    return p.value;
  }

  private async downloadSecretRow(
    init?: SecretStoreGetInit
  ): Promise<Record<string, ParsedSecret>> {
    assert.ok(
      init === undefined || typeof init === 'object',
      'downloadSecretRow: init must be an object when provided'
    );
    if (init?.force !== true && this.cachedBody !== null) {
      return this.cachedBody;
    }

    if (init?.force === true) {
      this.cachedBody = null;
      this.inflightDownload = null;
    }

    if (this.inflightDownload !== null) {
      return this.inflightDownload;
    }

    const download = this.fetchSecretBody(init).then((body) => {
      assert.record(body, 'Vault: fetched body must be an object');
      const out: Record<string, ParsedSecret> = {};
      const ha: Assert = hotAssert();
      for (const key of Object.keys(body)) {
        ha.nonEmptyString(key, 'Vault: body key must be non-empty');
        out[key] = parseSecret(body, key);
      }
      this.cachedBody = out;
      this.inflightDownload = null;
      return out;
    });

    this.inflightDownload = download;
    return download;
  }

  private async fetchSecretBody(
    init?: SecretStoreGetInit
  ): Promise<Record<string, unknown>> {
    const url = this.kvDataPath();
    assert.nonEmptyString(url, 'fetchSecretBody: url must be non-empty');
    const requestInit: RequestInit = {
      method: 'GET',
      headers: {
        'X-Vault-Token': this.token,
        Accept: 'application/json',
      },
    };
    if (init?.signal !== undefined) {
      assert.instanceOf(
        init.signal,
        AbortSignal,
        'fetchSecretBody: signal must be an AbortSignal'
      );
      requestInit.signal = init.signal;
    }

    const response = await this.fetchWithRateLimitRetry(url, requestInit);
    assert.defined(response, 'fetchSecretBody: response is required');
    return readVaultKvBody(response, `${this.project}/${this.config}`);
  }

  private async fetchWithRateLimitRetry(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    assert.nonEmptyString(
      url,
      'fetchWithRateLimitRetry: url must be non-empty'
    );
    assert.record(init, 'fetchWithRateLimitRetry: init must be an object');
    assert.nonNegativeInteger(
      this.rateLimitRetries,
      'fetchWithRateLimitRetry: rateLimitRetries invariant'
    );
    let attempt = 0;
    while (true) {
      let response: Response;
      try {
        response = await this.fetchFn(url, init);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new SecretStoreRequestError(
          `Vault KV read failed (network): ${msg}`
        );
      }
      // HTTP 530 (node removed from HA cluster) is potentially transient - retry
      if (
        (response.status !== 429 && response.status !== 530) ||
        attempt >= this.rateLimitRetries
      ) {
        return response;
      }
      const retryAfterMs = parseRetryAfterMs(
        response.headers.get('Retry-After')
      );
      // For HTTP 530, use a fixed backoff (no Retry-After header expected)
      const backoffMs =
        retryAfterMs ??
        (response.status === 530
          ? 2_000
          : Math.min(2 ** attempt * 250, RATE_LIMIT_BACKOFF_CAP_MS));
      attempt += 1;
      await this.sleep(backoffMs);
    }
  }
}
