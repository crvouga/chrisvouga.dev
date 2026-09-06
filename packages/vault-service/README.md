# Secret Store (OpenBao)

Production-ready [OpenBao](https://openbao.org/) deployment on Railway — Neon Postgres storage, Cloudflare DNS, and a standalone GitHub Actions deploy workflow (not part of the infra fleet **Deploy fleet**).

**URL:** https://vault.chrisvouga.dev

Deploy vault bootstraps from **GitHub repo secrets** (`RAILWAY_TOKEN`, `CF_API_TOKEN`, `DB_CONNECTION_URI`) — it does not use Vault KV or the fleet `vault-secrets` OIDC action. After Vault is up and KV is seeded, fleet scripts use `vault run` as usual.

## Architecture

```
infra repo (packages/vault-service/** push or deploy-vault workflow)
  └── deploy-vault.yml
        ├── migrate Neon Postgres (secret_store schema)
        ├── build + push ghcr.io/crvouga/chrisvouga-vault
        ├── packages/vault-service/scripts/railway-provision.sh + railway-deploy.sh
        ├── packages/vault-service/scripts/railway-sync-dns.sh (vault.chrisvouga.dev)
        └── unseal + smoke-test from crvouga.kv

OpenBao (Railway) ──storage──► Neon Postgres (secret_store schema)
Cloudflare DNS ──► vault.chrisvouga.dev ──► Railway TLS
crvouga.kv ──unseal keys + root_token──► CI unseal + smoke-test
GitHub secrets ──bootstrap──► Railway / Cloudflare (no KV required)
```

## Database schema

All database objects live in the **`secret_store`** schema — never `public`:

| Table | Purpose |
|-------|---------|
| `secret_store.vault_kv_store` | OpenBao storage backend |
| `secret_store.vault_ha_locks` | OpenBao HA locks (reserved for future use) |
| `secret_store.schema_migrations` | Applied migration tracking |

OpenBao is configured with `skip_create_table = true` so it never auto-creates tables in `public`. The entrypoint sets `search_path=secret_store` on the Postgres connection so all OpenBao queries resolve to the custom schema.

## Prerequisites

- [GitHub CLI (`gh`)](https://cli.github.com/) — `gh auth login`
- [Neon CLI (`neonctl`)](https://neon.com/docs/reference/cli-install) — `neonctl auth`
- **Cloudflare API token** — [create manually](https://dash.cloudflare.com/profile/api-tokens) with **Zone:DNS:Edit** for `chrisvouga.dev`
- [Vault CLI (`vault`)](https://openbao.org/docs/install/) — OpenBao-compatible; used for init, smoke tests, and local dev
- [PostgreSQL client (`psql`)](https://www.postgresql.org/download/) — for migrations
- [`jq`](https://jqlang.github.io/jq/) — for init and seed scripts

## First-Time Setup

### 1. Seed GitHub secrets

Log in to each provider, then run the seed script. It auto-fetches secrets from your CLI sessions and pushes them to GitHub Actions:

```bash
gh auth login
neonctl auth          # npm i -g neonctl  (or: npx neonctl auth)

# Cloudflare: create Zone:DNS:Edit token at https://dash.cloudflare.com/profile/api-tokens
export CLOUDFLARE_API_TOKEN='your-token'

chmod +x scripts/seed-github-secrets.sh
./scripts/seed-github-secrets.sh
```

| Secret | Required | Source |
|--------|----------|--------|
| `CF_API_TOKEN` | Yes | `CLOUDFLARE_API_TOKEN` — dashboard API token |
| `DB_CONNECTION_URI` | Yes | `neon connection-string` |
| `RAILWAY_TOKEN` | Yes | Railway account API token — [railway.app/account/tokens](https://railway.app/account/tokens) |
| `VAULT_TOKEN` | Optional | `init-output.json` — CI reads `root_token` from `crvouga.kv` instead |

Flags:

- `--skip-vault` — do not fetch or set `VAULT_TOKEN`

Optional overrides via [`.env`](.env) or [`.env.secrets`](.env.secrets.example). Set `NEON_PROJECT_ID` if you have multiple Neon projects.

Runtime secrets (`DB_CONNECTION_URI`) are synced to Railway via the deploy workflow.

### 2. Deploy via GitHub Actions

Push `packages/vault-service/**` on the infra repo (or run **Deploy vault** manually). The workflow migrates the DB, builds the image, runs `packages/vault-service/scripts/railway-*.sh` (GitHub secrets only — no Vault KV), reconciles DNS, unseals OpenBao, and runs smoke tests.

Every container restart leaves OpenBao **sealed**; CI unseals automatically on each deploy.

### Local Railway ops (no `vault run`)

When Vault is down, sealed, or KV at `secret/personal/prd` is empty:

```bash
export RAILWAY_TOKEN=... CLOUDFLARE_API_TOKEN=... DB_CONNECTION_URI=...
cd vault
make provision    # provision-railway --id vault
make deploy       # provision + sync secrets + deploy + DNS
make sync-dns     # Cloudflare record for vault.chrisvouga.dev only
make destroy      # destroy-railway --id vault
```

Scripts live under [`scripts/railway-*.sh`](scripts/) and call infra root `provision-railway`, `deploy-railway`, etc. `RAILWAY_TOKEN` may also be read from repo-root `.railway-token`.

### 3. Initialize OpenBao (one-time, local)

After the first deploy succeeds, run init locally:

```bash
export DB_CONNECTION_URI="postgres://..."
export VAULT_ADDR="https://vault.chrisvouga.dev"

chmod +x scripts/init.sh scripts/migrate.sh
./scripts/init.sh
```

This script will:

1. Run database migrations (`scripts/migrate.sh`)
2. Wait for OpenBao to become reachable
3. Initialize OpenBao (5 unseal keys, threshold 3)
4. Save credentials to `init-output.json` (gitignored)
5. Unseal OpenBao with 3 keys

**Save the unseal keys and root token from the output immediately.**

Store unseal keys and `root_token` in `crvouga.kv` so CI can auto-unseal and smoke-test.

## **WARNING: Back Up Unseal Keys and Root Token**

**Losing your unseal keys or root token means losing access to ALL secrets permanently.** Store them offline in a password manager or secure physical backup. Never commit them to git.

## Database migrations

Migrations live in [`migrations/`](migrations/) and are applied by [`scripts/migrate.sh`](scripts/migrate.sh):

```bash
export DB_CONNECTION_URI="postgres://..."
./scripts/migrate.sh
```

The **Deploy** workflow runs migrations on every push to `main` (before build/deploy).

## Manual Unseal

After a restart or redeploy, OpenBao starts **sealed**. CI auto-unseals on every deploy from `crvouga.kv`. To re-unseal without redeploying:

```bash
gh workflow run deploy-vault.yml -f unseal_only=true
```

To unseal manually from the CLI:

```bash
export VAULT_ADDR="https://vault.chrisvouga.dev"

vault operator unseal   # enter unseal key 1
vault operator unseal   # enter unseal key 2
vault operator unseal   # enter unseal key 3

vault status            # should show Sealed: false
```

## Smoke Tests

### Locally

```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

### In CI

Smoke tests run at the end of the **Deploy** workflow after auto-unseal. The job reads `root_token` from `crvouga.kv` via [`scripts/fetch-vault-token.sh`](scripts/fetch-vault-token.sh).

## Syncing dev keys to prd

Use [`scripts/sync-dev-keys-to-prd.sh`](scripts/sync-dev-keys-to-prd.sh) to copy missing keys from `dev` to `prd` per project. Existing prd keys are never overwritten.

```bash
./scripts/vault-run.sh -- ./scripts/sync-dev-keys-to-prd.sh --dry-run
./scripts/vault-run.sh -- ./scripts/sync-dev-keys-to-prd.sh
```

## Resource migration

Operator scripts for moving B2 object storage and Postgres between Vault `dev` and `prd` configs. Default project is `personal`.

**Prerequisites:** [Vault CLI](https://openbao.org/docs/install/), `jq`, `curl`, [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) (B2 S3-compatible API), `psql`, `pg_dump`, `pg_restore`. For Neon/Postgres 18 hosts, install matching clients (`brew install postgresql@18`) — the clone script auto-selects `/opt/homebrew/opt/postgresql@18/bin` or falls back to Docker when local `pg_dump` is too old.

Suggested order:

1. Seed B2 secrets in Vault (manual or `--seed-vault-secrets` on the clone script)
2. Alias B2 → S3 keys in the same KV path
3. Verify object-storage credentials
4. Copy legacy bucket objects into dev/prd buckets
5. Verify Postgres `DATABASE_URL` health
6. Refresh dev database from prod (one-way)

| Script | Purpose |
|--------|---------|
| [`create-s3-secrets-from-b2.sh`](scripts/create-s3-secrets-from-b2.sh) | Copy `B2_*` fields to `S3_*` aliases (including `S3_ACCESS_KEY` / `S3_SECRET_KEY`) |
| [`check-object-storage-creds.sh`](scripts/check-object-storage-creds.sh) | Probe B2 and S3 bucket credentials for dev/prd |
| [`clone-b2-bucket-from-legacy.sh`](scripts/clone-b2-bucket-from-legacy.sh) | Full sync from `legacy-b2.json` source bucket into Vault dev/prd buckets |
| [`check-database-url-health.sh`](scripts/check-database-url-health.sh) | `SELECT 1` health check for `DATABASE_URL` in dev/prd |
| [`clone-prod-database-to-dev.sh`](scripts/clone-prod-database-to-dev.sh) | One-way `pg_dump` / `pg_restore` from prd → dev |

```bash
# Alias B2 secrets to S3 names (dry-run first)
make alias-s3-from-b2
./scripts/vault-run.sh -- ./scripts/create-s3-secrets-from-b2.sh

# Verify credentials and Postgres
make check-object-storage
make check-database-url

# Copy legacy B2 bucket objects (dry-run by default; --confirm to write)
make clone-b2-from-legacy
./scripts/vault-run.sh -- ./scripts/clone-b2-bucket-from-legacy.sh --confirm

# Clone prod database into dev (dry-run by default; --confirm to write)
make clone-prod-db-to-dev
./scripts/vault-run.sh -- ./scripts/clone-prod-database-to-dev.sh --schema gamezilla --confirm
```

Source credentials for the B2 bucket clone live in repo-root `legacy-b2.json` (gitignored). Target credentials are read from `secret/personal/dev` and `secret/personal/prd` using the same `B2_*` field names.

## Using secrets locally

Install the global `vault` wrapper once, then use `vault run` in any project:

```bash
chmod +x scripts/install-cli.sh
./scripts/install-cli.sh
vault login hvs.your-root-token

cd ~/my-app
vault setup --project myapp --config dev
vault run -- bun myserver.tsx
```

## Health Checks

Container health checks hit:

```
GET /v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200
```

Returns HTTP 200 even when sealed or uninitialized, so the process stays healthy while waiting for init/unseal.

## Repository Structure

```
packages/vault-service/
├── Makefile                       # make deploy | provision | destroy | sync-dns
├── config/openbao.hcl             # OpenBao server config
├── migrations/                    # SQL migrations (secret_store schema)
├── scripts/
│   ├── railway-provision.sh       # Bootstrap: provision-railway --id vault
│   ├── railway-deploy.sh          # sync-railway-secrets + deploy-railway
│   ├── railway-destroy.sh         # destroy-railway --id vault
│   ├── railway-sync-dns.sh       # vault.chrisvouga.dev DNS only
│   ├── lib/railway-bootstrap.sh   # RAILWAY_TOKEN / CF token (no vault run)
│   ├── init.sh                    # First-time initialization
│   ├── migrate.sh                 # Apply database migrations
│   ├── unseal.sh                  # Auto-unseal from crvouga.kv (CI)
│   ├── seed-github-secrets.sh     # Auto-fetch + seed GitHub secrets
│   ├── smoke-test.sh              # End-to-end verification
│   └── ...
├── docker-entrypoint.sh
└── Dockerfile
```

CI workflow: infra repo `.github/workflows/deploy-vault.yml` (not a nested `packages/vault-service/.github/workflows/deploy.yml`).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Smoke test returns 503 | OpenBao is sealed — run manual unseal or `gh workflow run deploy-vault.yml -f unseal_only=true` |
| DNS not resolving | `cd vault && make sync-dns` (needs `CF_API_TOKEN`) or re-run **Deploy vault**; flush local cache: `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder` |
| `vault run` / sync-dns fails with missing prd KV | Bootstrap vault with env exports + `make deploy`; re-seed `secret/personal/prd` after init |
| Container crash loop: `DB_CONNECTION_URI is required` | Export `DB_CONNECTION_URI` and re-run `make deploy` (syncs to Railway before image deploy). CI needs the GitHub secret on both provision and deploy steps. |
| DB connection errors | Verify `DB_CONNECTION_URI` GitHub secret / Railway service variables |
| Migration job fails | Check `DB_CONNECTION_URI` GitHub secret; ensure Neon allows GitHub Actions IPs |
