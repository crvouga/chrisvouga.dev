# Infra (Railway)

Railway deployment for all services on the zone defined in [`services.yaml`](services.yaml) (`zone: chrisvouga.dev`).

Each project repo builds and pushes its own public image to `ghcr.io/<image_owner>/<image_prefix>-<id>` (e.g. `ghcr.io/crvouga/chrisvouga-portfolio`). This repo **only consumes those images** — GitHub Actions provisions Railway services via the GraphQL API, syncs DNS/secrets, deploys, and health-checks.

Cloudflare DNS points custom domains at Railway (CNAME + TXT verification). Railway terminates TLS on custom domains; Cloudflare SSL mode is **Full (strict)** with DNS-only records.

Platform paths, service names, and GHCR prefixes are derived from `services.yaml` — not hardcoded in scripts.

**Scale to zero (default):** most services use Railway serverless sleep (`railway.sleep: true`).

**Always on:** `vault` only (`railway.sleep: false`). Vault is **standalone** — not deployed by the fleet **Deploy fleet** workflow.

## Architecture

```
Project repos ──▶ ghcr.io (public images)
                        │
                        ▼
              Infra CI (GitHub Actions)
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
       dns-sync   railway-secrets  deploy-railway
          │             │             │
          └─────────────┼─────────────┘
                        ▼
         Railway (infra / production)
                        │
                        ▼
              *.<zone> via Cloudflare DNS
```

## Configuration ([`services.yaml`](services.yaml))

| Field                    | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `zone`                   | Primary DNS zone (e.g. `chrisvouga.dev`)                                |
| `image_owner`            | GHCR org/user                                                           |
| `infra_github_repo`      | GitHub repo slug for this infra repo                                    |
| `railway.project`        | Railway project name (e.g. `infra`)                                     |
| `railway.environment`    | Environment name (default `production`)                                 |
| `railway.region`         | Deployment region (default `us-east4`)                                  |
| `railway.service_prefix` | Optional service name prefix (default: none — names match service `id`) |
| `railway.sleep`          | Per service: `true` (serverless) or `false` (always on)                 |

Derived automatically: `image_prefix` (`chrisvouga`), Vault URL (`https://vault.<zone>`).

Inspect derived values:

```bash
bun run print-platform-env
```

## First deploy

Vault must exist before fleet scripts can read secrets from KV. Bootstrap does **not** use `vault run` — GitHub secrets (or exported env) only.

### 1. Deploy vault (standalone)

Seed GitHub secrets from the vault repo:

```bash
cd packages/vault-service
export CLOUDFLARE_API_TOKEN='...'   # Zone:DNS:Edit for chrisvouga.dev
./scripts/seed-github-secrets.sh    # CF_API_TOKEN, DB_CONNECTION_URI, RAILWAY_TOKEN
```

Run **Deploy vault** (push `packages/vault-service/**` to `main`, or Actions → Deploy vault). The workflow uses `packages/vault-service/scripts/railway-*.sh` — no Vault OIDC / KV required.

After first deploy: `./scripts/init.sh`, store unseal keys in `crvouga.kv`.

Local alternative (no CI):

```bash
export RAILWAY_TOKEN=... CLOUDFLARE_API_TOKEN=... DB_CONNECTION_URI=...
cd packages/vault-service && make deploy
```

### 2. Seed Vault KV

In `secret/data/personal/prd` on Vault (`https://vault.<zone>`):

| Key                     | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `RAILWAY_TOKEN`         | Railway account API token                                               |
| `GITHUB_TOKEN_SUPER`    | PAT with `repo` + `admin:org` — triggers workflows, cross-repo dispatch |
| `CLOUDFLARE_API_TOKEN`  | DNS sync                                                                |
| `CLOUDFLARE_ACCOUNT_ID` | DNS sync                                                                |
| Per-app keys            | See `secrets:` blocks in `services.yaml`                                |

### 3. Provision fleet on Railway

```bash
vault run -- bun run provision-railway --apply
# or: export RAILWAY_TOKEN=... && bun run provision-railway --apply
```

Creates project `infra`, fleet services (excludes vault), custom domains, and volumes. After migrating from prefixed names, run `bun run rename-railway --apply` once.

### 4. Run Deploy fleet

Actions → **Deploy fleet** → Run workflow (or push to `main`). Matrix excludes standalone vault.

### 5. DNS cutover

After validating services on Railway default URLs:

```bash
vault run -- bun run sync-dns --apply --wait-for-certs
bun run health-check --all-public
```

Fleet DNS sync does not manage `vault.<zone>` — that record is owned by deploy-vault / `cd packages/vault-service && make sync-dns`.

### 6. Fly teardown (post-cutover)

```bash
bun run destroy-fly --apply
```

Remove `FLY_TOKEN` from Vault after Fly apps are destroyed.

## Per-service deploy

Sibling repos dispatch `deploy-service` with `{ id, image_tag }` after publishing to GHCR. Infra deploys a single Railway service.

Manual single-service deploy:

```bash
gh workflow run deploy-fleet.yml -f service_id=portfolio -f image_tag=abc123
```

## Local scripts

```bash
bun install
bun run typecheck
bun check                             # CI-equivalent check (format + tc + lint + test + build)
bun run check:ci                      # full CI reproduction (also runs the Vault dev-secret gate)
bun run provision-railway --check --fleet-only   # CI drift check (excludes standalone vault)
bun run provision-railway --apply   # create/update Railway resources
bun run deploy-railway --id portfolio
bun run sync-railway-secrets --id portfolio
bun run sync-dns --apply
```

See [`ci.md`](ci.md) for the full check/CI reference.

## Parallel validation (pre-cutover)

1. `provision-railway --apply` + `deploy-railway` for all services
2. Health-check via Railway URLs: `bun run health-check --id todo-app --base-url https://<railway-url>`
3. When ready: `sync-dns --apply --wait-for-certs` for production hostnames

## Repo layout

Single flat Turborepo + Bun workspace. Every package is `@pkgs/*` and lives under `packages/`:

```
packages/
  api/                     # Turborepo remote cache server (@pkgs/api) + cache-support scripts
  infra/                   # services.yaml + lib/ + infra/fleet ops scripts (@pkgs/infra)
  {assert,logger,object-store,secret-store,secret-string,vault}/  # @pkgs/* libs
  9router/                 # local 9router CLI (@pkgs/9router)
  vault-service/           # OpenBao (deploy-vault workflow)
  workstation/             # portable local-machine config (bun run workspace:setup)
.github/workflows/
  deploy-fleet.yml
  deploy-vault.yml
  ci-turborepo.yml
  publish-image.yml
```

Ops scripts are invoked via root wrappers, e.g. `bun run sync-dns`, `bun run provision-railway --apply` (each delegates to `bun run --filter @pkgs/infra …`).
