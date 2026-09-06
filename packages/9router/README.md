# 9router (local Node/npm)

Runs [decolua/9router](https://github.com/decolua/9router) from a local clone on **http://127.0.0.1:20128**. Not part of the Railway fleet. Tooling is an interactive TypeScript CLI (`tsx` + `@inquirer/prompts`).

Cursor BYOK uses the stable public hostname **https://9router.chrisvouga.dev** (named Cloudflare tunnel → local `:20128`).

## Prerequisites

- Node.js 18+ and npm
- Vault access for secrets — a valid login session (`vault login`) with read on `secret/personal/prd`
- For Cursor: `cloudflared` (`brew install cloudflared`)

If Secrets: Pull returns 403, your `~/.vault-token` is expired. Re-auth first:

```bash
vault login -method=userpass username=crvouga
# or: vault login <root-or-dev-token>
```

## Interactive CLI

All operations go through one entry point. There are no per-task npm scripts or CLI flags — options are prompted in the menu.

```bash
cd 9router
npm install
npm start          # or: npm run cli / npx 9router
```

**Controls:** type to filter · ↑↓ navigate · Enter to run · Ctrl+C to quit.

Recent commands are remembered under `.pids/cli-history.json` and shown at the top of the menu.

### Menu commands

| Command | What it does |
| ------- | ------------ |
| App: Build | Build + OAuth redirect patch |
| App: Install deps | `npm install` in `app/` |
| App: Sync | Clone/update upstream into `app/` |
| Combos: Check | Validate materialized combos vs registry and remote |
| Combos: Sync | Resolve semantic `combos.yaml` tiers from connected providers |
| Cursor: Sync | Write BYOK base URL + materialized combo models into Cursor |
| Daemons: Start | Daemonize 9Router + Cloudflare tunnel |
| Daemons: Status | Pids, port, local/public URLs, log paths |
| Daemons: Stop | Stop both; free the app port |
| Exit | Quit |
| Providers: Connect Kiro | Device-code OAuth for Kiro |
| Providers: Setup credentials | Paste API keys → Vault → connect (prompts for scope and options) |
| Providers: Sync | Connect providers from Vault/env (prompts for dry-run, force, OAuth, strict) |
| Secrets: Pull | Write app secrets from Vault into `.env` |
| Setup: Full | Pull secrets → sync app → install deps → build |
| Tunnel: Foreground | Debug: run named tunnel in the foreground |
| Tunnel: Provision | Named tunnel + DNS for `9router.chrisvouga.dev` |

## One-time setup

```bash
cd 9router
npm install
brew install cloudflared
cloudflared tunnel login
npm start
```

In the menu, run in order:

1. **Setup: Full**
2. **Tunnel: Provision**
3. **Daemons: Start**

Health check: http://127.0.0.1:20128/api/health

## Day-to-day

```bash
npm start
```

Typical picks: **Daemons: Start**, **Daemons: Status**, **Daemons: Stop**, **App: Build** (after App: Sync), **Tunnel: Foreground** (debug only).

Logs: `.pids/9router.log`, `.pids/tunnel.log`.

Recommended after Daemons: Start (or when adding Vault provider keys):

1. **Providers: Setup credentials** (or **Providers: Sync**) — integrate as many providers as you can
2. **Combos: Sync** — builds variants from whatever connected (skips missing tiers)
3. **Combos: Check** — confirms materialized set matches remote
4. **Cursor: Sync** (quit Cursor first) — only exposes combos that can work

## Providers (Vault-driven)

[`providers.yaml`](providers.yaml) plus registry auto-discovery. With 9Router running:

**Seed API-key credentials** — menu: **Providers: Setup credentials**. You will be prompted for:

- Scope (combo-only vs all)
- Dry run / open browser URLs / connect after Vault write / re-prompt when key exists
- Per provider: overwrite existing, paste secret (hidden), or skip/quit

OAuth providers are not in that walkthrough — use the dashboard or **Providers: Sync** with interactive OAuth enabled.

**Sync existing Vault keys** — menu: **Providers: Sync**. Prompts cover dry-run, force refresh, interactive OAuth (kiro/github), and strict mode.

**Idempotent:** already-connected providers are skipped. Missing Vault/env credentials skip that provider unless strict mode is on. Unsupported browser OAuth with interactive mode is skipped (not a hard fail).

**Credential sources (priority):**

1. Local auto-import — Cursor (`state.vscdb`) and Kiro (AWS SSO cache)
2. Vault KV `secret/personal/prd` (or process env / `vault run` / Providers: Setup credentials)
3. Interactive OAuth (Providers: Sync) / Providers: Connect Kiro for device-code

**Vault key naming** (field name = env var; not written to `.env` by default):

| Kind | Example |
| ---- | ------- |
| API key (default) | `glm` → `GLM_API_KEY`, `minimax` → `MINIMAX_API_KEY` |
| Shared overrides | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CLOUDFLARE_API_TOKEN`, … (see `vaultKeyOverrides` in providers.yaml) |
| Kiro | `KIRO_REFRESH_TOKEN` (optional `KIRO_CLIENT_ID` / `KIRO_CLIENT_SECRET` / `KIRO_API_KEY`) |
| Codex | `CODEX_ACCESS_TOKEN` (+ optional refresh/id/email) |
| Cursor | `CURSOR_ACCESS_TOKEN` + `CURSOR_MACHINE_ID` (or local auto-import) |

Browser-only OAuth (Claude Code, most subscription providers) is skipped unless you connect in the dashboard or use device-code where supported.

## Combos (semantic templates → connected models)

[`combos.yaml`](combos.yaml) describes **use cases** (roles / providers / pick counts) — never concrete model ids. **Combos: Sync** resolves them:

- Expands `role: free|cheap|subscription` or `providers: […]` to connected LLM providers only
- Picks models from each provider’s registry catalog (ranked heuristics + registry order)
- Drops variants that resolve to zero models
- Adds **`9router-connected`** — unique models from all remaining variants
- Prompts for dry-run and prune (default on)

**Combos: Check** compares remote to that materialized set. Unconnected providers skip tiers (info), not a hard fail.

Auth prefers the local CLI token (`x-9r-cli-token` from `$DATA_DIR/machine-id` + `$DATA_DIR/auth/cli-secret`), then falls back to `INITIAL_PASSWORD` login (from Vault `9ROUTER_PASSWORD` via `.env` or `vault run`). `DATA_DIR` in `.env` always wins over ambient shell — defaults to `./data`.

Use a materialized combo name as the model in Cursor / Claude Code / etc. (e.g. `9router-free` or `9router-connected`). If a named variant was dropped (nothing connected for its tiers), it will not appear after Sync.

If Cursor shows **Provider Error** with `providerStatusCode: 404`, re-run **Providers: Sync** then **Combos: Sync** / **Combos: Check** so Cursor only lists combos with live credentials.

### Sync into Cursor

Cursor Agent/Chat calls your OpenAI base URL from **Cursor's cloud**, not from your Mac.
A localhost URL (`http://127.0.0.1:20128/v1`) always fails with:

`Access to private networks is forbidden`

**Cursor: Sync** writes **`https://9router.chrisvouga.dev/v1`** by default (you can pick env or a custom URL when prompted). Keep daemons up (**Daemons: Start**) so that hostname reaches local 9Router.

```bash
npm start
# Daemons: Start → quit Cursor → Cursor: Sync
```

Prompted options include dry-run, force while Cursor is open, prune removed combo names, base URL choice, and allow-private (Agent will still 403 on localhost).

Then reopen Cursor and select a materialized combo (e.g. `9router-connected` or a remaining named variant) in the model picker.

If Cursor errors with the private-networks message, the synced base URL is still private — re-run **Cursor: Sync** without allowing private URLs. If the hostname is correct but requests hang, run **Daemons: Status** and ensure both daemons are up.

Progress is logged as `[sync-cursor] …` steps. Backup is row-level only (the keys Cursor: Sync changes), not a copy of the full `state.vscdb` — important when that file is very large.

## Layout

| Path | Purpose |
| ---- | ------- |
| `package.json` | `npm start` / `npm run cli` / bin `9router` |
| `cli/` | Interactive CLI (menus, prompts, commands) |
| `combos.yaml` | Semantic combo use-cases (roles/providers; models resolved at sync) |
| `providers.yaml` | Provider sync methods + Vault key overrides |
| `app/` | Gitignored clone of `decolua/9router` |
| `data/` | Persistent app data (`DATA_DIR`) |
| `.env` | Secrets (gitignored); copy from `.env.example` or Secrets: Pull |
| `.cloudflared/` | Generated named-tunnel config (gitignored) |
| `.pids/` | Daemon pid + log files + CLI history (gitignored) |
| `scripts/lib/` | Shared libraries used by the CLI |
| `scripts/oauth-redirect-patch.ts` | Claude OAuth redirect patch applied after App: Build |

## Secrets

Stored in Vault at `secret/personal/prd` (override with `VAULT_KV_CONFIG=dev`). Prefixed KV fields map to `.env` / upstream env vars:

| Vault field | App env var |
| ----------- | ----------- |
| `9ROUTER_PASSWORD` | `INITIAL_PASSWORD` |
| `9ROUTER_JWT_SECRET` | `JWT_SECRET` |
| `9ROUTER_API_KEY_SECRET` | `API_KEY_SECRET` |
| `9ROUTER_MACHINE_ID_SALT` | `MACHINE_ID_SALT` |

Legacy unprefixed keys (`INITIAL_PASSWORD`, etc.) are still accepted if prefixed keys are absent.

**Seed once** (generate random values for the three non-password secrets):

```bash
vault kv patch secret/personal/prd \
  9ROUTER_PASSWORD='…' \
  9ROUTER_JWT_SECRET="$(openssl rand -hex 32)" \
  9ROUTER_API_KEY_SECRET="$(openssl rand -hex 32)" \
  9ROUTER_MACHINE_ID_SALT="$(openssl rand -hex 32)"
```

**Pull into `.env`:** `npm start` → **Secrets: Pull**

**Or inject at runtime** (no `.env` write; uses [`9router/.vault.yaml`](.vault.yaml)):

```bash
vault run -- npm start
```

The CLI auto-fetches from Vault when secrets are missing (`ensureAppSecrets`). Provider API keys / OAuth tokens stay in Vault KV (or local auto-import) — Providers: Sync reads them without writing into `.env`. Cloudflare tunnel cert/credentials stay machine-local (`cloudflared tunnel login` + Tunnel: Provision).

## Notes

- Upstream: `https://github.com/decolua/9router` (override with `NINEROUTER_REPO_URL` / `NINEROUTER_BRANCH`).
- Listens on `HOSTNAME`/`PORT` from `.env` (defaults `0.0.0.0:20128`).
- `9router.chrisvouga.dev` is a Cloudflare named tunnel only — not in fleet `services.yaml` / `sync-dns`.
