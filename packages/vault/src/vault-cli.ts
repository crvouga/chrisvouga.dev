import { execSync } from 'node:child_process';

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
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeTokenEnvName(rawName: string | undefined): string {
  const tokenEnvName = (rawName ?? VAULT_TOKEN_ENV_NAME).trim();
  if (tokenEnvName.length === 0) {
    throw createVaultCliError('VaultCli: tokenEnvName must be non-empty');
  }
  return tokenEnvName;
}

function normalizeAddr(addr: string | undefined): string | null {
  const trimmed = addr?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : null;
}

function normalizeMount(mount: string | undefined): string {
  const trimmed = mount?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : 'secret';
}

export class VaultCli {
  private readonly tokenEnvName: string;
  private readonly processEnv: NodeJS.ProcessEnv;
  private readonly execSyncFn: typeof execSync;
  private readonly addr: string | null;
  private readonly mount: string;

  constructor(options?: VaultCliOptions) {
    this.tokenEnvName = normalizeTokenEnvName(options?.tokenEnvName);
    this.processEnv = options?.processEnv ?? process.env;
    this.execSyncFn = options?.execSyncFn ?? execSync;
    this.addr = normalizeAddr(options?.addr);
    this.mount = normalizeMount(options?.mount);
  }

  private runVaultRaw(subcommand: string, args: readonly string[]): string {
    // The `vault` binary is a wrapper (secret-store) that only special-cases
    // `run`/`setup` and passes everything else through to the underlying Vault
    // CLI. A leading `-address` flag is NOT accepted by the wrapper, so the
    // address must be supplied via the VAULT_ADDR env var instead.
    const cmd = ['vault', subcommand, ...args].join(' ');
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

    return { token: fromCli, source: 'cli' };
  }

  /** KV v2 path: `{project}/{config}`. */
  secretPath(project: string, config: string): string {
    return `${project}/${config}`;
  }

  /**
   * Read a single field from KV v2. Returns `null` when the path or field is
   * missing.
   */
  kvGetField(project: string, config: string, key: string): string | null {
    const path = this.secretPath(project, config);
    try {
      const out = this.runVaultRaw('kv', [
        'get',
        `-mount=${this.mount}`,
        `-field=${key}`,
        path,
      ]);
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  }

  /** Patch a single field onto an existing KV v2 secret. */
  kvPatch(project: string, config: string, key: string, value: string): void {
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
    try {
      this.kvPatch(project, config, key, value);
    } catch {
      this.kvPut(project, config, key, value);
    }
  }

  /** @deprecated Use {@link kvUpsertField} instead. */
  setSecret(project: string, config: string, key: string, value: string): void {
    this.kvUpsertField(project, config, key, value);
  }
}
