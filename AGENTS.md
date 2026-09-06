# Agent Notes

## Global resource naming

| Resource | Pattern | Example |
| -------- | ------- | ------- |
| Railway project | from `services.yaml` → `railway.project` | `infra` |
| Railway service | service `id` (no prefix) | `portfolio`, `vault` |
| GHCR image | `chrisvouga-<id>` | `ghcr.io/crvouga/chrisvouga-portfolio` |
| External image | optional `image:` in `services.yaml` (verbatim; skips GHCR) | `ghcr.io/example/app:latest` |
| S3 bucket (when owned by this stack) | `crvouga-<purpose>` or existing shared bucket keys in Vault | — |

Railway names come from [`services.yaml`](services.yaml) via `railwayServiceName()` in [`lib/services.ts`](lib/services.ts) — defaults to the service `id`. Legacy Fly.io apps used the `crvouga-` prefix; see `legacyFlyAppName()`.

Public DNS hostnames stay on the zone (`portfolio.chrisvouga.dev`, etc.); Railway custom domains are provisioned via the GraphQL API and synced to Cloudflare.

**Railway API quota:** run one Railway script at a time locally (`sync-dns`, `rename-railway`, `provision-railway`, etc.). Do not run ad-hoc `bun -e` polling loops — use `sync-dns --apply --wait-for-certs` when waiting for TLS. Set `RAILWAY_WAIT_ON_RATE_LIMIT=1` or pass `--wait-on-rate-limit` on maintenance scripts to sleep through 429 windows.

## Standalone vault (`vault/`)

Vault is **`standalone: true`** in [`services.yaml`](services.yaml) — excluded from the fleet **Deploy fleet** workflow, fleet DNS sync, and `destroy-fly`. It bootstraps from **GitHub repo secrets** (or exported env), not Vault KV / OIDC.

| Resource | Value |
| -------- | ----- |
| Railway service | `vault` |
| Public hostname | `vault.chrisvouga.dev` |
| GHCR image | `ghcr.io/crvouga/chrisvouga-vault` |
| CI | **Deploy vault** (`.github/workflows/deploy-vault.yml`) on `vault/**` changes |

**Bootstrap order (first deploy or rebuild):**

1. Seed GitHub secrets: `RAILWAY_TOKEN`, `CF_API_TOKEN`, `DB_CONNECTION_URI` — `cd vault && ./scripts/seed-github-secrets.sh`
2. Deploy vault: push `vault/**` to `main`, or `cd vault && make gh` → run workflow
3. Init/unseal OpenBao locally (`vault/scripts/init.sh`); store keys in `crvouga.kv`
4. Seed KV at `secret/data/personal/prd` (Railway token, Cloudflare, per-app keys)
5. Fleet: `bun run provision-railway --apply` then **Deploy fleet**

**Local vault ops (Vault may be down — no `vault run`):**

```bash
export RAILWAY_TOKEN=... CLOUDFLARE_API_TOKEN=... DB_CONNECTION_URI=...
cd vault && make deploy    # provision + deploy; make provision | destroy | sync-dns
```

**Fleet ops (Vault must be up + KV seeded):**

```bash
vault login                    # admin session
vault run -- bun run sync-dns --apply
```

If `vault run` fails with `No value found at secret/personal/prd`, KV is empty — use direct env exports or `vault login` + CLI until prd is re-seeded. For day-to-day local work, `.vault.yaml` may use `config: dev` when prd is empty during a rebuild.

## Turborepo remote cache (`turborepo/`)

- Nested Bun monorepo; `cd turborepo && bun install` for local dev.
- CI: **CI turborepo** (`.github/workflows/ci-turborepo.yml`) on `turborepo/**` — check + publish on API changes.
- Deploy: publish dispatches infra **Deploy fleet** for `turborepo`.
- See [`turborepo/AGENTS.md`](turborepo/AGENTS.md) for secrets and client usage.

## Local 9router (`9router/`)

Not on Railway. Local Node/npm only at `http://127.0.0.1:20128`. Cursor BYOK uses the named Cloudflare tunnel **https://9router.chrisvouga.dev** (not fleet `sync-dns`). See [`9router/README.md`](9router/README.md): `cd 9router && npm i && npm start` (interactive menu for setup, provision-tunnel, start/stop daemons, sync, etc.).

Vault KV at `secret/personal/prd`: `9ROUTER_PASSWORD`, `9ROUTER_JWT_SECRET`, `9ROUTER_API_KEY_SECRET`, `9ROUTER_MACHINE_ID_SALT` (→ `.env` via `npm start` → Pull secrets, or `vault run -- …`).

## Workstation (`workstation/`)

Portable local-machine configuration; the source of truth for the global OpenCode notification plugin and its click-to-focus stack.

- Managed home links: `~/.config/opencode/plugins/notifications.ts`, `~/.config/opencode/bin/{opencode-notifier,focus-opencode}` → `workstation/opencode/**`; `OpenCodeNotifier.swift` is compiled by setup into `~/.config/opencode/bin/OpenCodeNotifier.app`
- Setup: `bun run workstation:setup` (idempotent; refuses to overwrite unmanaged files)
- Canonical context: [`workstation/README.md`](workstation/README.md); agent directive: [`workstation/AGENTS.md`](workstation/AGENTS.md)
- No secrets live here — they come from Vault KV at `secret/data/personal/{dev|prd}`.

## Hard rules

- Never commit `VAULT_TOKEN`, `RAILWAY_TOKEN`, or deploy tokens.
- Vault KV paths for runtime: `secret/data/personal/{dev|prd}`.
- All Railway provisioning goes through GraphQL scripts (`provision-railway`, `deploy-railway`, `sync-railway-secrets`) — not manual dashboard edits.
