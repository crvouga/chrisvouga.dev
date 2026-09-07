# Checks & CI

This repo uses a single canonical check pipeline so that what runs locally is the same as what runs in CI. If `bun check` is green, the **CI turborepo** check job will be green.

## Canonical local check

```bash
bun check
```

`bun check` is an alias for `bun run check`, which runs, in order:

1. `bun install --frozen-lockfile` — verifies `bun.lock` is in sync with `package.json` (mirrors CI's install step).
2. `prettier --check .` — formatting (`ci:format`).
3. `turbo run tc lint test build` — per-package typecheck, lint, test, and build across all `@pkgs/*`.

> Turbo caches results locally (`.turbo/`). CI always runs fresh. If a change is not reflected by `bun check`, run `bun run check -- --force` to bypass the cache and force a real re-run.

## Full CI reproduction

The CI check job also validates the Vault dev config (requires Vault OIDC / a Vault session). Reproduce the entire CI job:

```bash
bun run check:ci
```

This runs `bun install --frozen-lockfile`, then `check:vault-secrets`, then `bun check`. If you only want the Vault gate:

```bash
bun run check:vault-secrets        # dev config (CI gate)
bun run check:vault-secrets:prd    # prd config (deploy gate)
```

`check:vault-secrets` needs a Vault session (e.g. `vault run --config dev -- bun run check:vault-secrets`). See `packages/api/scripts/vault-secrets-registry.ts` for the required keys and `packages/api/scripts/check-vault-secrets.ts` for what is validated.

## Individual checks

| Command                       | What it does                                        |
| ----------------------------- | --------------------------------------------------- |
| `bun run ci:format`           | `prettier --check .`                                |
| `bun run ci:install`          | `bun install --frozen-lockfile`                     |
| `bun run tc`                  | `turbo run tc` (typecheck every package)            |
| `bun run typecheck`           | Root `tsc --noEmit` (covers `packages/workstation`) |
| `bun run check:vault-secrets` | Verify dev Vault config (CI gate)                   |

## Getting all checks green

Run `bun check` and address failures in the order the script reports them:

1. **Lockfile error** — a `package.json`/`bun.lock` mismatch. Run `bun install` to regenerate `bun.lock`, then re-run `bun check`.
2. **Prettier warning** — a file is not formatted. Run `bun run format` (or `bunx prettier --write <file>`), then re-run `bun check`.
3. **`tc` (typecheck) failure** — fix the TypeScript error in the named package. `@pkgs/api` and the `@pkgs/*` libs use the strict base (`tsconfig.strict.json`); `@pkgs/infra` uses the loose root config.
4. **`lint` failure** — run the package's eslint (`eslint . --max-warnings 0`). Check `packages/eslint-rules` for shared rule fragments.
5. **`test` failure** — fix the failing assertion. Tests run under `bun test`.
6. **`build` failure** — `@pkgs/api` build is `test -f Dockerfile`; the rest are package-level builds.

If everything is green locally but you want to confirm parity with the fresh CI run, force a cache bypass:

```bash
bun run check -- --force
```

## CI workflow

- `.github/workflows/ci-turborepo.yml` — the check gate. Triggered on push to `main` and on pull requests touching `packages/**`, `package.json`, `bun.lock`, `turbo.json`, `tsconfig.json`, `.prettierrc`, `.prettierignore`.
- The `check` job runs `bun install --frozen-lockfile`, imports Vault dev secrets via OIDC, runs `bun run check:vault-secrets`, then `bun run check`.

Open the last run: `bun run gh:ci`.

## Hard rules

- Never commit `VAULT_TOKEN`, `RAILWAY_TOKEN`, or deploy tokens.
- Never disable structural size limits or patch dependencies — refactor instead.
- Keep `bun.lock` in sync (`bun install` after changing `package.json`).
