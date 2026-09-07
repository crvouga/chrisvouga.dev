# Check & CI

This repo uses a single canonical check pipeline so that what runs locally is the
same as what runs in CI. If `bun check` is green, the **CI turborepo** check job
will be green.

## Canonical local check

```bash
bun check
```

`bun check` is an alias for `bun run check`, which runs, in order:

1. `bun install --frozen-lockfile` — verifies `bun.lock` is in sync with `package.json` (mirrors CI's install step).
2. `prettier --check .` — formatting (`ci:format`).
3. `turbo run tc lint test build` — per-package typecheck, lint, test, and build across all `@pkgs/*`.

> Turbo caches results locally (`.turbo/`). CI always runs fresh. If a change is
> not reflected by `bun check`, run `bun run check -- --force` to bypass the
> cache and force a real re-run.

## Fix-and-check loop

Run `bun check`. Fix failures in the order the script reports them. After each
fix, re-run `bun check`. Repeat until green. Do not stop after the first green —
you must also push and watch CI.

`bun check` only covers the local `check` job. It does **not** validate the CI
`publish` job, which builds and pushes the Docker image from
`packages/api/Dockerfile` and can fail on Docker/build-context errors that are
invisible locally (e.g. a `.dockerignore` rule excluding a workspace whose
`package.json` the Dockerfile `COPY`s). A green `bun check` is **not** proof that
CI is green — always watch the full CI run (see [Watch CI & fix failures](#watch-ci--fix-failures)).

| Failure           | Fix                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lockfile mismatch | `bun install` (regenerates `bun.lock`), then re-check.                                                                                                   |
| Prettier warning  | `bun run format` (or `bunx prettier --write <file>`), then re-check.                                                                                     |
| `tc` (typecheck)  | Fix the TypeScript error in the named package. `@pkgs/api` + `@pkgs/*` libs use strict `tsconfig.strict.json`; `@pkgs/infra` uses the loose root config. |
| `lint`            | Run the package's eslint (`eslint . --max-warnings 0`). Shared rules live in `packages/eslint-rules`.                                                    |
| `test`            | Fix the failing assertion (runs under `bun test`).                                                                                                       |
| `build`           | `@pkgs/api` build is `test -f Dockerfile`; others are package builds.                                                                                    |

Loop rule: if a fix does not change the result, run `bun run check -- --force`
to bypass the turbo cache before debugging further.

Once the loop is green and everything is good to merge, **finish by committing
and pushing** (see [Commit & push](#commit--push)). Do not stop at a green local
run — the change is only done when it is committed and pushed so CI confirms it.
Running the loop is a _fix-and-check_ cycle; ending it means the code is
committed and pushed.

## Full CI reproduction

The CI check job also validates the Vault dev config (requires Vault OIDC / a
Vault session). Reproduce the entire CI job:

```bash
bun run check:ci
```

This runs `bun install --frozen-lockfile`, then `check:vault-secrets`, then
`check:smoke:secrets` (smoke tests every registered secret), then `bun check`.
If you only want the Vault gate:

```bash
bun run check:vault-secrets        # dev config (CI gate)
bun run check:vault-secrets:prd    # prd config (deploy gate)
```

`check:vault-secrets` needs a Vault session (e.g. `vault run --config dev -- bun run check:vault-secrets`). See `packages/api/scripts/vault-secrets-registry.ts` for the required keys, `packages/api/scripts/check-vault-secrets.ts` for what is validated, and `packages/api/scripts/smoke-test-secrets.ts` for the per-secret smoke test.

If Vault is unavailable (KV empty / service down), you can still get `bun check`
green locally. In that case, clearly state that the Vault gate (`check:vault-secrets`)
could not be verified locally but is validated by CI OIDC.

## Individual checks

| Command                       | What it does                                        |
| ----------------------------- | --------------------------------------------------- |
| `bun run ci:format`           | `prettier --check .`                                |
| `bun run ci:install`          | `bun install --frozen-lockfile`                     |
| `bun run tc`                  | `turbo run tc` (typecheck every package)            |
| `bun run typecheck`           | Root `tsc --noEmit` (covers `packages/workstation`) |
| `bun run check:vault-secrets` | Verify dev Vault config (CI gate)                   |
| `bun run check:smoke:secrets` | Smoke test every registered secret (CI gate)        |

## Commit & push

This is the required finish to the fix-and-check loop. Once `bun check` (and
`check:ci` if Vault is available) is green and the change is good to merge,
commit and push:

1. Inspect before committing: `git status`, `git diff`, `git log --oneline -10`.
2. Stage only intended files — never commit secrets (`VAULT_TOKEN`, `RAILWAY_TOKEN`, deploy tokens) or generated artifacts.
3. Write a Conventional Commit message (subject ≤ 50 chars, lowercase type):
   - `fix: ...` for fixing broken checks
   - `feat: ...` for new functionality
   - `refactor: ...` for non-behavior changes
   - `chore: ...` for housekeeping
   - Include a body only when the "why" is not obvious.
4. Commit: `git add <files> && git commit -m "fix: ..."`
5. Push: `git push` (CI triggers on push to `main`).

There is no separate "merge" step for this repo — committing to `main` and
pushing **is** the merge. When the loop is green and good to merge, always end
it by committing and pushing.

## Watch CI & fix failures

Pushing is not the end of the loop. After pushing, watch the **CI turborepo** run
to completion and fix any failure before you are done:

```bash
bun run gh:ci:watch     # blocks until the latest CI turborepo run finishes
bun run gh:ci:status    # quick summary of the last few runs
bun run gh:ci:log       # failed-step logs of the latest run (if it failed)
```

If the run fails, read the failing step's logs and fix it locally. A `publish`
job failure is usually a Docker/build issue — inspect `.dockerignore` and
`packages/api/Dockerfile` (see the note above). Then re-run the loop and push
again. Repeat until the CI run is green.

The change is only done when the **full** CI run is green, not just `bun check`.
To browse the run in a browser: `bun run gh:ci`.

## CI workflow

- `.github/workflows/ci-turborepo.yml` — the check gate. Triggered on push to `main` and on pull requests touching `packages/**`, `package.json`, `bun.lock`, `turbo.json`, `tsconfig.json`, `.prettierrc`, `.prettierignore`.
- The `check` job runs `bun install --frozen-lockfile`, imports Vault dev secrets via OIDC, runs `bun run check:vault-secrets`, then `bun run check`.

## Hard rules

- Never commit `VAULT_TOKEN`, `RAILWAY_TOKEN`, or deploy tokens.
- Never disable structural size limits or patch dependencies — refactor instead.
- Keep `bun.lock` in sync (`bun install` after changing `package.json`).
- Don't force-push or amend a pushed commit; create a new commit.
