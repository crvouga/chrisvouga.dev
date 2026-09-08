import { execSync } from 'node:child_process';

import { assert } from '@pkgs/assert';

const VAULT_TOKEN_ENV_NAME = 'VAULT_TOKEN';
const VAULT_PRINT_TOKEN_COMMAND = 'vault print token';

export type VaultTokenSource = 'env' | 'cli';

export type VaultTokenResult = {
  token: string;
  source: VaultTokenSource;
};

export type VaultCliOptions = {
  tokenEnvName?: string;
  processEnv?: NodeJS.ProcessEnv;
  execSyncFn?: typeof execSync;
  /** Vault API address (e.g. from `.vault.yaml`). */
  addr?: string;
  /** KV v2 mount path (e.g. `secret`). */
  mount?: string;
};

function createVaultCliError(message: string, options?: ErrorOptions): Error {
  const error = new Error(message, options);
  error.name = 'VaultCliError';
  return error;
}

function shellEscape(value: string): string {
  assert.string(value, 'VaultCli.shellEscape: value must be a string');
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  const escaped = `'${value.replace(/'/g, `'\\''`)}'`;
  assert.nonEmptyString(
    escaped,
    'VaultCli.shellEscape: escaped must be non-empty'
  );
  assert.ok(
    escaped.startsWith(`'`),
    'VaultCli.shellEscape: escaped must be quoted'
  );
  return escaped;
}

function normalizeTokenEnvName(rawName: string | undefined): string {
  assert.ok(
    rawName === undefined || typeof rawName === 'string',
    'VaultCli.normalizeTokenEnvName: rawName must be a string when provided'
  );
  const tokenEnvName = (rawName ?? VAULT_TOKEN_ENV_NAME).trim();
  if (tokenEnvName.length === 0) {
    throw createVaultCliError('VaultCli: tokenEnvName must be non-empty');
  }
  assert.nonEmptyString(
    tokenEnvName,
    'VaultCli.normalizeTokenEnvName: result must be non-empty'
  );
  return tokenEnvName;
}

function normalizeAddr(addr: string | undefined): string | null {
  assert.ok(
    addr === undefined || typeof addr === 'string',
    'VaultCli.normalizeAddr: addr must be a string when provided'
  );
  const trimmed = addr?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    return trimmed;
  }
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }
  assert.fail('unreachable: normalizeAddr must return trimmed or null');
}

function normalizeMount(mount: string | undefined): string {
  assert.ok(
    mount === undefined || typeof mount === 'string',
    'VaultCli.normalizeMount: mount must be a string when provided'
  );
  const trimmed = mount?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    return trimmed;
  }
  assert.nonEmptyString(
    'secret',
    'VaultCli.normalizeMount: default mount fallback valid'
  );
  return 'secret';
}

export class VaultCli {
  private readonly tokenEnvName: string;
  private readonly processEnv: NodeJS.ProcessEnv;
  private readonly execSyncFn: typeof execSync;
  private readonly addr: string | null;
  private readonly mount: string;

  constructor(options?: VaultCliOptions) {
    assert.ok(
      options === undefined ||
        (typeof options === 'object' && options !== null),
      'VaultCli: options must be an object when provided'
    );
    this.tokenEnvName = normalizeTokenEnvName(options?.tokenEnvName);
    assert.defined(process.env, 'VaultCli: process.env fallback valid');
    this.processEnv = options?.processEnv ?? process.env;
    assert.defined(execSync, 'VaultCli: execSync fallback valid');
    this.execSyncFn = options?.execSyncFn ?? execSync;
    this.addr = normalizeAddr(options?.addr);
    this.mount = normalizeMount(options?.mount);
    assert.nonEmptyString(
      this.tokenEnvName,
      'VaultCli: tokenEnvName invariant'
    );
    assert.nonEmptyString(this.mount, 'VaultCli: mount invariant');
    assert.defined(this.processEnv, 'VaultCli: processEnv must be set');
    assert.defined(this.execSyncFn, 'VaultCli: execSyncFn must be set');
  }

  private runVaultRaw(subcommand: string, args: readonly string[]): string {
    assert.nonEmptyString(
      subcommand,
      'VaultCli.runVaultRaw: subcommand must be non-empty'
    );
    assert.array(args, 'VaultCli.runVaultRaw: args must be an array');
    // The `vault` binary is a wrapper (secret-store) that only special-cases
    // `run`/`setup` and passes everything else through to the underlying Vault
    // CLI. A leading `-address` flag is NOT accepted by the wrapper, so the
    // address must be supplied via the VAULT_ADDR env var instead.
    const cmd = ['vault', subcommand, ...args].join(' ');
    assert.nonEmptyString(cmd, 'VaultCli.runVaultRaw: cmd must be non-empty');
    assert.ok(
      cmd.startsWith('vault '),
      'VaultCli.runVaultRaw: cmd must target vault'
    );
    const env =
      this.addr !== null
        ? { ...this.processEnv, VAULT_ADDR: this.addr }
        : this.processEnv;
    try {
      return this.execSyncFn(cmd, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      }).trim();
    } catch (error: unknown) {
      throw createVaultCliError(`vault command failed: \`${cmd}\``, {
        cause: error,
      });
    }
  }

  resolveToken(): VaultTokenResult {
    const fromEnv = this.processEnv[this.tokenEnvName];
    assert.ok(
      fromEnv === undefined || typeof fromEnv === 'string',
      'VaultCli.resolveToken: env value must be a string when set'
    );
    if (typeof fromEnv === 'string') {
      const trimmed = fromEnv.trim();
      if (trimmed.length > 0) {
        return { token: trimmed, source: 'env' };
      }
    }

    let fromCli: string;
    try {
      fromCli = this.runVaultRaw('print', ['token']);
    } catch (error: unknown) {
      throw createVaultCliError(
        `failed to resolve ${this.tokenEnvName} from CLI (\`${VAULT_PRINT_TOKEN_COMMAND}\`)`,
        { cause: error }
      );
    }

    if (fromCli.length === 0) {
      throw createVaultCliError(
        `${this.tokenEnvName} resolved blank from Vault CLI output`
      );
    }
    assert.nonEmptyString(
      fromCli,
      'VaultCli.resolveToken: CLI token must be non-empty here'
    );

    return { token: fromCli, source: 'cli' };
  }

  /** KV v2 path: `{project}/{config}`. */
  secretPath(project: string, config: string): string {
    assert.nonEmptyString(
      project,
      'VaultCli.secretPath: project must be non-empty'
    );
    assert.nonEmptyString(
      config,
      'VaultCli.secretPath: config must be non-empty'
    );
    const path = `${project}/${config}`;
    assert.nonEmptyString(path, 'VaultCli.secretPath: path must be non-empty');
    return path;
  }

  /**
   * Read a single field from KV v2. Returns `null` when the path or field is
   * missing.
   */
  kvGetField(project: string, config: string, key: string): string | null {
    assert.nonEmptyString(
      project,
      'VaultCli.kvGetField: project must be non-empty'
    );
    assert.nonEmptyString(
      config,
      'VaultCli.kvGetField: config must be non-empty'
    );
    assert.nonEmptyString(key, 'VaultCli.kvGetField: key must be non-empty');
    const path = this.secretPath(project, config);
    try {
      const out = this.runVaultRaw('kv', [
        'get',
        `-mount=${this.mount}`,
        `-field=${key}`,
        path,
      ]);
      assert.string(out, 'VaultCli.kvGetField: output must be a string');
      if (out.length > 0) {
        return out;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Patch a single field onto an existing KV v2 secret. */
  kvPatch(project: string, config: string, key: string, value: string): void {
    assert.nonEmptyString(
      project,
      'VaultCli.kvPatch: project must be non-empty'
    );
    assert.nonEmptyString(config, 'VaultCli.kvPatch: config must be non-empty');
    assert.nonEmptyString(key, 'VaultCli.kvPatch: key must be non-empty');
    assert.string(value, 'VaultCli.kvPatch: value must be a string');
    const path = this.secretPath(project, config);
    this.runVaultRaw('kv', [
      'patch',
      `-mount=${this.mount}`,
      path,
      `${key}=${shellEscape(value)}`,
    ]);
  }

  /**
   * Create or fully replace a KV v2 secret with a single field. Used when
   * `kv patch` fails because the path does not exist yet.
   */
  kvPut(project: string, config: string, key: string, value: string): void {
    assert.nonEmptyString(project, 'VaultCli.kvPut: project must be non-empty');
    assert.nonEmptyString(config, 'VaultCli.kvPut: config must be non-empty');
    assert.nonEmptyString(key, 'VaultCli.kvPut: key must be non-empty');
    assert.string(value, 'VaultCli.kvPut: value must be a string');
    const path = this.secretPath(project, config);
    this.runVaultRaw('kv', [
      'put',
      `-mount=${this.mount}`,
      path,
      `${key}=${shellEscape(value)}`,
    ]);
  }

  /**
   * Upsert a single field: patch when the path exists, put when it does not.
   */
  kvUpsertField(
    project: string,
    config: string,
    key: string,
    value: string
  ): void {
    assert.nonEmptyString(
      project,
      'VaultCli.kvUpsertField: project must be non-empty'
    );
    assert.nonEmptyString(
      config,
      'VaultCli.kvUpsertField: config must be non-empty'
    );
    assert.nonEmptyString(key, 'VaultCli.kvUpsertField: key must be non-empty');
    assert.string(value, 'VaultCli.kvUpsertField: value must be a string');
    try {
      this.kvPatch(project, config, key, value);
    } catch {
      this.kvPut(project, config, key, value);
    }
  }

  /** @deprecated Use {@link kvUpsertField} instead. */
  setSecret(project: string, config: string, key: string, value: string): void {
    assert.nonEmptyString(
      project,
      'VaultCli.setSecret: project must be non-empty'
    );
    assert.nonEmptyString(
      config,
      'VaultCli.setSecret: config must be non-empty'
    );
    assert.nonEmptyString(key, 'VaultCli.setSecret: key must be non-empty');
    assert.string(value, 'VaultCli.setSecret: value must be a string');
    this.kvUpsertField(project, config, key, value);
  }
}
