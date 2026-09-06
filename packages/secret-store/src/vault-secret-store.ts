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
  if (name.length === 0) {
    throw new SecretStoreRequestError('Secret name must be non-empty');
  }
}

type ParsedSecret = 'missing' | 'blank' | { readonly value: string };

function parseSecret(
  body: Record<string, unknown>,
  name: string
): ParsedSecret {
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
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 'blank';
  }
  return { value: trimmed };
}

function trimOpt(value: string | undefined): string | null {
  if (value === undefined) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

const DEFAULT_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_CAP_MS = 5_000;
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseRetryAfterMs(header: string | null): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(Math.round(seconds * 1000), RATE_LIMIT_BACKOFF_CAP_MS);
}

type KvV2Response = {
  data?: {
    data?: Record<string, unknown>;
  };
};

function parseKvDataObject(json: unknown): Record<string, unknown> {
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
  return data;
}

async function readVaultKvBody(
  response: Response,
  path: string
): Promise<Record<string, unknown>> {
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
  return parseKvDataObject(json);
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
    const t = options.token.trim();
    if (t.length === 0) {
      throw new SecretStoreRequestError(
        'VaultSecretStore: token is required (non-empty string)'
      );
    }
    const project = trimOpt(options.project);
    const config = trimOpt(options.config);
    if (project === null || config === null) {
      throw new SecretStoreRequestError(
        'VaultSecretStore: project and config are required (non-empty strings)'
      );
    }
    this.token = t;
    this.addr = trimOpt(options.addr) ?? DEFAULT_ADDR;
    this.mount = trimOpt(options.mount) ?? DEFAULT_MOUNT;
    this.project = project;
    this.config = config;
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.rateLimitRetries =
      options.rateLimitRetries !== undefined
        ? Math.max(0, Math.floor(options.rateLimitRetries))
        : DEFAULT_RATE_LIMIT_RETRIES;
    this.sleep = options.sleep ?? defaultSleep;
  }

  kvDataPath(): string {
    return `${this.addr.replace(/\/$/, '')}/v1/${this.mount}/data/${this.project}/${this.config}`;
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
    if (names.length === 0) {
      return {};
    }
    for (const n of names) {
      assertNonBlankName(n);
    }
    const row = await this.downloadSecretRow(init);
    const out: Record<string, SecretString> = {};
    for (const name of names) {
      out[name] = wrapSecret(name, this.requiredFromRow(row, name));
    }
    return out;
  }

  async getOptionalMany(
    names: readonly string[],
    init?: SecretStoreGetInit
  ): Promise<Record<string, SecretString | null>> {
    if (names.length === 0) {
      return {};
    }
    for (const n of names) {
      assertNonBlankName(n);
    }
    const row = await this.downloadSecretRow(init);
    const out: Record<string, SecretString | null> = {};
    for (const name of names) {
      out[name] = wrapSecretOptional(name, this.optionalFromRow(row, name));
    }
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
    throw new SecretStoreRequestError(
      `VaultSecretStore is HTTP-read-only; cannot setSecret("${name}"). ` +
        'For Bun/Node scripts use VaultCli.kvPatch/kvPut.'
    );
  }

  private requiredFromRow(
    row: Record<string, ParsedSecret>,
    name: string
  ): string {
    const p = row[name];
    if (p === undefined || p === 'missing') {
      throw new SecretMissingError(name);
    }
    if (p === 'blank') {
      throw new SecretBlankError(name);
    }
    return p.value;
  }

  private optionalFromRow(
    row: Record<string, ParsedSecret>,
    name: string
  ): string | null {
    const p = row[name];
    if (p === undefined || p === 'missing' || p === 'blank') {
      return null;
    }
    return p.value;
  }

  private async downloadSecretRow(
    init?: SecretStoreGetInit
  ): Promise<Record<string, ParsedSecret>> {
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
      const out: Record<string, ParsedSecret> = {};
      for (const key of Object.keys(body)) {
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
    const requestInit: RequestInit = {
      method: 'GET',
      headers: {
        'X-Vault-Token': this.token,
        Accept: 'application/json',
      },
    };
    if (init?.signal !== undefined) {
      requestInit.signal = init.signal;
    }

    const response = await this.fetchWithRateLimitRetry(url, requestInit);
    return readVaultKvBody(response, `${this.project}/${this.config}`);
  }

  private async fetchWithRateLimitRetry(
    url: string,
    init: RequestInit
  ): Promise<Response> {
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
