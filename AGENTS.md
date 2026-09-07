# Agent Notes

## Monorepo layout

Single flat Turborepo + Bun workspace at the repo root. Every package is scoped `@pkgs/*` and lives under `packages/`:

- `packages/api` — Turborepo remote cache server (`@pkgs/api`), the only deployable app; its cache-support scripts (`vault-secrets-registry`, `ensure-vault-secrets`, `check-vault-secrets`, `smoke-test-cache`, `seed-turbo-client-secrets`, `vault-yaml-defaults`, `verify-b2-s3`) are colocated in `packages/api/scripts/`
- `packages/infra` — infra/fleet management (`@pkgs/infra`): `services.yaml`, `lib/` (Railway/Cloudflare/GHCR/Fly helpers), and the ops scripts (`provision-railway`, `deploy-railway`, `sync-dns`, `sync-redirects`, `sync-aliases`, `sync-railway-secrets`, `rename-railway`, `destroy-*`, `list-deploy-service-ids`, `make-ghcr-public`, `print-platform-env`, `rollout-publish`, `seed-vault-github-secret`, `health-check`, `cleanup-railway-deployments`)
- `packages/{assert,logger,object-store,secret-store,secret-string,vault}` — `@pkgs/*` libraries
- `packages/eslint-rules` — shared ESLint rule fragments (plain dir, referenced by relative path)
- `packages/9router` — local-only 9router CLI (`@pkgs/9router`)
- `packages/vault-service` — standalone OpenBao service (Docker + shell; no package.json)
- `packages/workstation` — portable local-machine config (no package.json)

Root holds only monorepo orchestration: `package.json`, `turbo.json`, `tsconfig.json`, `tsconfig.strict.json`, `bun.lock`, dotfiles, `.vault.yaml`, CI workflows, `AGENTS.md`, `README.md`.

`bun install` at the root installs all workspaces. `bun run check` (alias `bun check`) runs `bun install --frozen-lockfile` + prettier + `turbo run tc lint test build` across packages, mirroring the CI check job; `bun run check:ci` additionally runs the Vault dev-secret gate; see `ci.md`. `bun run tc` typechecks all packages. The root `tsconfig.json` typechecks `packages/workstation`; `tsconfig.strict.json` is the strict base `packages/api` + the `@pkgs/*` libs extend (`packages/infra` uses the loose root config).

**A green `bun check` is not a green CI.** After pushing, watch the **CI turborepo** run (`bun run gh:ci:watch`) and fix any failure before declaring the task done. `bun check` only covers the `check` job — it does not validate the `publish` job (Docker image build from `packages/api/Dockerfile`), which can fail on `.dockerignore`/build-context errors that are invisible locally. See `ci.md` → **Watch CI & fix failures**.

## Global resource naming

| Resource                             | Pattern                                                     | Example                                |
| ------------------------------------ | ----------------------------------------------------------- | -------------------------------------- |
| Railway project                      | from `services.yaml` → `railway.project`                    | `infra`                                |
| Railway service                      | service `id` (no prefix)                                    | `portfolio`, `vault`                   |
| GHCR image                           | `chrisvouga-<id>`                                           | `ghcr.io/crvouga/chrisvouga-portfolio` |
| External image                       | optional `image:` in `services.yaml` (verbatim; skips GHCR) | `ghcr.io/example/app:latest`           |
| S3 bucket (when owned by this stack) | `crvouga-<purpose>` or existing shared bucket keys in Vault | —                                      |

Railway names come from [`packages/infra/services.yaml`](packages/infra/services.yaml) via `railwayServiceName()` in [`packages/infra/lib/services.ts`](packages/infra/lib/services.ts) — defaults to the service `id`. Legacy Fly.io apps used the `crvouga-` prefix; see `legacyFlyAppName()`.

Public DNS hostnames stay on the zone (`portfolio.chrisvouga.dev`, etc.); Railway custom domains are provisioned via the GraphQL API and synced to Cloudflare.

**Railway API quota:** run one Railway script at a time locally (`sync-dns`, `rename-railway`, `provision-railway`, etc.). Do not run ad-hoc `bun -e` polling loops — use `sync-dns --apply --wait-for-certs` when waiting for TLS. Set `RAILWAY_WAIT_ON_RATE_LIMIT=1` or pass `--wait-on-rate-limit` on maintenance scripts to sleep through 429 windows.

## Standalone vault (`packages/vault-service/`)

Vault is **`standalone: true`** in [`packages/infra/services.yaml`](packages/infra/services.yaml) — excluded from the fleet **Deploy fleet** workflow, fleet DNS sync, and `destroy-fly`. It bootstraps from **GitHub repo secrets** (or exported env), not Vault KV / OIDC.

| Resource        | Value                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Railway service | `vault`                                                                                |
| Public hostname | `vault.chrisvouga.dev`                                                                 |
| GHCR image      | `ghcr.io/crvouga/chrisvouga-vault`                                                     |
| CI              | **Deploy vault** (`.github/workflows/deploy-vault.yml`) on `packages/vault-service/**` |

**Bootstrap order (first deploy or rebuild):**

1. Seed GitHub secrets: `RAILWAY_TOKEN`, `CF_API_TOKEN`, `DB_CONNECTION_URI` — `cd packages/vault-service && ./scripts/seed-github-secrets.sh`
2. Deploy vault: push `packages/vault-service/**` to `main`, or `cd packages/vault-service && make gh` → run workflow
3. Init/unseal OpenBao locally (`packages/vault-service/scripts/init.sh`); store keys in `crvouga.kv`
4. Seed KV at `secret/data/personal/prd` (Railway token, Cloudflare, per-app keys)
5. Fleet: `bun run provision-railway --apply` then **Deploy fleet**

**Local vault ops (Vault may be down — no `vault run`):**

```bash
export RAILWAY_TOKEN=... CLOUDFLARE_API_TOKEN=... DB_CONNECTION_URI=...
cd packages/vault-service && make deploy    # provision + deploy; make provision | destroy | sync-dns
```

**Fleet ops (Vault must be up + KV seeded):**

```bash
vault login                    # admin session
vault run -- bun run sync-dns --apply
```

If `vault run` fails with `No value found at secret/personal/prd`, KV is empty — use direct env exports or `vault login` + CLI until prd is re-seeded. For day-to-day local work, `.vault.yaml` may use `config: dev` when prd is empty during a rebuild.

## Turborepo remote cache (`packages/api` + `@pkgs/*`)

The cache server is `packages/api` (`@pkgs/api`). Runtime dependency closure: `@pkgs/{assert,logger,object-store,secret-store,secret-string,vault}`. Support scripts live in `packages/api/scripts/` (`vault-secrets-registry.ts`, `ensure-vault-secrets.ts`, `check-vault-secrets.ts`, `smoke-test-cache.ts`, `seed-turbo-client-secrets.ts`, `verify-b2-s3.ts`, `vault-yaml-defaults.ts`).

- CI: **CI turborepo** (`.github/workflows/ci-turborepo.yml`) on `packages/**` and root build config — check + publish on API changes.
- Deploy: publish dispatches infra **Deploy fleet** for the `turborepo` service.

### Hard rules

- **Never patch dependencies.** CI should reject bun/pnpm patch mechanisms.
- **Never disable structural size limits** in eslint config or source files. Refactor instead.

### Architecture

Self-hosted Turborepo Remote Cache on the chrisvouga.dev origin stack (Docker + Bun). Artifacts live in Backblaze B2 via `@pkgs/object-store` (`createS3ObjectStore` → `ObjectStoreImplS3`). Physical object keys are always `turbo-cache/prd/<artifact-hash>` in the shared bucket. Runtime secrets load from Vault at boot.

CI publishes a **public** image to **GHCR** (`ghcr.io/crvouga/chrisvouga-turborepo:<sha>`); infra **Deploy fleet** pulls and runs it. If the package is new, set GHCR visibility to public once in GitHub package settings.

### Vault secrets (source of truth)

Canonical registry: [`packages/api/scripts/vault-secrets-registry.ts`](packages/api/scripts/vault-secrets-registry.ts)

| Config | Purpose                                       |
| ------ | --------------------------------------------- |
| `dev`  | Local dev + CI (`check:vault-secrets`)        |
| `prd`  | Production deploy (`check:vault-secrets:prd`) |

Both configs must carry the same required keys. `bun run setup` runs `ensure-vault-secrets.ts` to write derived defaults (`TURBO_API`, `TURBO_TEAM`, `TURBO_CACHE`) into **dev** and **prd** when missing.

Required keys (manual): `TURBO_TOKEN`, `VAULT_TOKEN`, B2 `B2_*`.

### Scripts

| Script                            | Purpose                                                |
| --------------------------------- | ------------------------------------------------------ |
| `bun run setup`                   | `packages/api/.env` + ensure Vault defaults in dev/prd |
| `bun run check:vault-secrets`     | Verify dev config (CI gate)                            |
| `bun run check:vault-secrets:prd` | Verify prd config (deploy gate)                        |
| `bun run deploy`                  | Points to infra ci-turborepo workflow                  |

### CI/CD

- **ci-turborepo.yml** (infra repo) — Vault dev secrets (OIDC) + `bun run check` on `packages/**`; publishes GHCR image on API changes and dispatches **Deploy fleet**

### Client usage

```bash
export TURBO_API=https://turborepo.chrisvouga.dev
export TURBO_TOKEN=<same as Vault TURBO_TOKEN>
export TURBO_TEAM=local
turbo run build --cache=remote:rw
```

### Local dev

```bash
bun install
vault setup --project personal --config dev
bun run setup
bun run dev # bun server :8787
```

## Local 9router (`packages/9router/`)

Not on Railway. Local bun/tsx CLI at `http://127.0.0.1:20128`. Cursor BYOK uses the named Cloudflare tunnel **https://9router.chrisvouga.dev** (not fleet `sync-dns`). See [`packages/9router/README.md`](packages/9router/README.md): `cd packages/9router && bun install && bun start` (interactive menu for setup, provision-tunnel, start/stop daemons, sync, etc.).

Vault KV at `secret/personal/prd`: `9ROUTER_PASSWORD`, `9ROUTER_JWT_SECRET`, `9ROUTER_API_KEY_SECRET`, `9ROUTER_MACHINE_ID_SALT` (→ `.env` via `bun start` → Pull secrets, or `vault run -- …`).

## Workstation (`packages/workstation/`)

Portable local-machine configuration; the source of truth for the global OpenCode notification plugin and its click-to-focus stack.

- Managed home links: `~/.config/opencode/plugins/notifications.ts`, `~/.config/opencode/bin/{opencode-notifier,focus-opencode}` → `packages/workstation/opencode/**`; `OpenCodeNotifier.swift` is compiled by setup into `~/.config/opencode/bin/OpenCodeNotifier.app`
- Setup: `bun run workstation:setup` (idempotent; refuses to overwrite unmanaged files); `bun run opencode:setup` is the OpenCode-only alias for the same script
- Canonical context: [`packages/workstation/README.md`](packages/workstation/README.md); agent directive: [`packages/workstation/AGENTS.md`](packages/workstation/AGENTS.md)
- No secrets live here — they come from Vault KV at `secret/data/personal/{dev|prd}`.

## Hard rules

- Never commit `VAULT_TOKEN`, `RAILWAY_TOKEN`, or deploy tokens.
- Vault KV paths for runtime: `secret/data/personal/{dev|prd}`.
- All Railway provisioning goes through GraphQL scripts (`provision-railway`, `deploy-railway`, `sync-railway-secrets`) — not manual dashboard edits.
