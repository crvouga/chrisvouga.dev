# Prompt: Wire a greenfield project to the self-hosted secret store

Copy everything below the line into your coding agent, running it **inside the
project repo you want to set up**.

---

You are wiring this **greenfield project** to a **self-hosted OpenBao/Vault**
secret store. The project has no existing `.vault.yaml` or stored tokens. Your
job is to identify what
secrets the app needs, connect it to the store, and document the workflow.

## What the secret store is

- A self-hosted [OpenBao](https://openbao.org/) instance (Vault-compatible API)
- API address: `https://vault.chrisvouga.dev`
- Secrets engine: **KV v2**, mounted at `secret/`
- Path convention: `secret/<project>/<config>`
  - `<project>` — logical app namespace (often the repo name, or `personal` for
    shared personal-app secrets)
  - `<config>` — environment name; use **`dev`** for local/default and **`prd`**
    for production/CI/deploy
  - Each secret key is a **field** on that KV object; fields become environment
    variables when injected via `vault run`

## CLI wrapper (install once per machine)

The `vault` repo ships a CLI wrapper with `run` and `setup` subcommands
on top of the real
`vault`/`bao` binary:

| Task | Command |
| ---- | ------- |
| Authenticate | `vault login hvs.xxx` (root or scoped dev token) |
| Configure this repo | `vault setup --project <p> --config <c>` → writes `.vault.yaml` |
| Run with secrets injected | `vault run -- <command>` |
| Preview env var names only | `vault run --dry-run -- <command>` |

All other `vault` subcommands pass through to the real binary.

Install from the `vault` repo (one-time per machine):

```bash
./scripts/install-cli.sh          # installs wrapper to ~/.local/bin/vault
vault login hvs.your-root-token   # or: ./scripts/create-dev-token.sh
```

Requires [Vault or OpenBao CLI](https://openbao.org/docs/install/) and `jq` on
PATH. Do not attempt to install global tooling yourself — tell me the exact
commands to run if they are missing.

## Fixed coordinates for this setup

Unless the repo clearly needs its own isolated namespace, use:

- Project: **`<repo-name>`** (the GitHub repo name without the owner prefix)
- Configs: **`dev`** and **`prd`**
- Store paths: `secret/<repo-name>/dev` and `secret/<repo-name>/prd`
- Default config for this repo: `dev` (use `prd` for production commands)

If this is a small personal app that shares secrets with other repos, `personal`
is also valid — but the pre-configured CI policy (below) only covers
`secret/personal/*` out of the box.

Use these defaults directly — do not ask me for the store address, mount, or
config names unless the repo's structure clearly requires something different.

## Authentication patterns

### Local development — `vault run`

Wrap dev/start/test commands in `vault run`. The wrapper reads `.vault.yaml`,
fetches `secret/<project>/<config>`, and injects every field as an env var.

### CI (GitHub Actions) — OIDC, no stored token

GitHub Actions OIDC is already configured on the store for repos under
`crvouga/*`. CI authenticates with a short-lived token minted per workflow run.

- Auth mount / method: `jwt` (trusts GitHub's OIDC issuer)
- Role: `github-actions`
- Policy: `ci-read` (read-only on `secret/personal/*` by default)
- Bound audience: `https://vault.chrisvouga.dev`
- Allowed repos: `crvouga/*` (any branch); tokens are short-lived (15m / 30m max)

Use `hashicorp/vault-action` (works against OpenBao):

```yaml
permissions:
  id-token: write # required to request a GitHub OIDC token
  contents: read

steps:
  - uses: hashicorp/vault-action@v3
    with:
      url: https://vault.chrisvouga.dev
      method: jwt
      path: jwt
      role: github-actions
      secrets: |
        secret/data/<project>/prd DATABASE_URL | DATABASE_URL ;
        secret/data/<project>/prd API_KEY     | API_KEY
```

Replace `<project>` with the project name chosen above (e.g. the repo name).

If `vault-action` fails with an audience error, add
`jwtGithubAudience: https://vault.chrisvouga.dev` to the step.

If it fails with a role/permission error:

- Repo outside `crvouga/*` → tell me to authorize it from the `vault`
  repo:

  ```bash
  ./scripts/setup-oidc-auth.sh --repo crvouga/<this-repo>
  ```

- Project path outside `secret/personal/*` → tell me to extend the CI read
  policy in the `vault` repo so `ci-read` covers
  `secret/data/<project>/*`, then re-apply the policy.

Never hardcode tokens or add a `VAULT_TOKEN` GitHub Actions secret for CI.

### App runtime (Workers, edge, long-running servers) — long-lived read token

Processes that cannot wrap their start command in `vault run` and cannot use
OIDC (e.g. Cloudflare Worker, edge function, server that fetches secrets at
boot) read the KV v2 HTTP API directly with a **long-lived, read-only
`VAULT_TOKEN`** stored as a platform secret:

```
GET https://vault.chrisvouga.dev/v1/secret/data/<project>/<config>
X-Vault-Token: <VAULT_TOKEN>
```

Response shape: `{ "data": { "data": { "KEY": "VALUE", … } } }` — fields live
under `.data.data`.

Tell me to mint and install the token (do not generate or hardcode one):

```bash
./scripts/create-dev-token.sh   # periodic, read-only token
# then e.g. wrangler secret put VAULT_TOKEN
```

The app should also receive `VAULT_CONFIG` (and optionally `VAULT_ADDR`,
`VAULT_PROJECT`, `VAULT_MOUNT`) as platform secrets or env vars — never committed
to git.

## Goal

**Fetch all secrets from the self-hosted store.** After setup:

- Local dev uses `vault run`
- CI uses GitHub Actions OIDC (no stored token)
- Runtime apps that cannot use either pattern use a read-only `VAULT_TOKEN`
  platform secret + KV v2 HTTP read
- No secret **values** in git — no `.env` files with real credentials, no
  hardcoded API keys, no committed tokens
- `.env.example` may list env var **names** with empty or placeholder values
- `.vault.yaml` is safe to commit (coordinates only, no secrets)

## Steps

1. **Audit required secrets.** Before editing, find every secret the app reads:
   `process.env.*`, `os.environ[...]`, `import.meta.env.*`, `env()` in
   wrangler/Docker configs, Docker `ENV`, CI workflow env blocks, etc. List each
   env var name and where it is referenced. Distinguish:
   - **Store-backed** — API keys, database URLs, signing secrets, third-party
     tokens
   - **Non-secret config** — public URLs, feature flags, ports (can stay in
     `.env.example` or code)

2. **Confirm prerequisites (instruct me if missing).** The `vault` wrapper
   must be installed and on `PATH`, and the Vault CLI/OpenBao binary must be
   present. See install commands above. Do not install global tooling yourself.

3. **Ensure secrets exist in the store.** Do NOT invent secret values. If
   `secret/<project>/dev` or `secret/<project>/prd` is missing or incomplete,
   tell me exactly which keys are needed and ask me to create them:

   ```bash
   vault login hvs.your-root-token   # or scoped write token
   vault kv put secret/<project>/dev  KEY1=value1 KEY2=value2
   vault kv put secret/<project>/prd  KEY1=value1 KEY2=value2
   ```

   For `dev` and `prd`, the **same key names** should exist in both configs
   (values may differ). Continue once I confirm the secrets are in place.

4. **Create `.vault.yaml`** at the repo root. It contains no secrets, only path
   coordinates, and is safe to commit:

   ```yaml
   addr: https://vault.chrisvouga.dev
   mount: secret
   project: <repo-name>
   config: dev # default; use prd for production commands
   ```

5. **Wire local commands.** Wrap dev/start/test scripts in `vault run`:
   - `package.json` scripts → `vault run -- <cmd>`
   - `Makefile` / `Justfile` targets → `vault run -- <cmd>`
   - Shell scripts and Dockerfiles that need secrets at build/run time
   - Default config is `dev`; production uses `vault run --config prd -- <cmd>`

6. **Update CI (GitHub Actions OIDC).** Add OIDC permissions and
   `hashicorp/vault-action` steps to pull only the secrets the workflow needs.
   Map each KV field to the env var name the workflow expects. Do not add a
   stored `VAULT_TOKEN` secret.

7. **Handle runtime secret fetching (if applicable).** If the app reads secrets
   at boot without `vault run` or OIDC (Workers, edge functions, long-running
   servers):
   - Implement KV v2 HTTP read at the path above
   - Read `VAULT_TOKEN`, `VAULT_CONFIG` (and optionally `VAULT_ADDR`,
     `VAULT_PROJECT`) from platform secrets
   - Map each field to the same env var name the app already expects
   - Tell me to provision the read-only token via `create-dev-token.sh` and
     install it as a platform secret

8. **Add `.env.example`.** Document required env var names (no real values).
   Note that local dev obtains them via `vault run` and production via CI OIDC
   or runtime token fetch.

9. **Update docs.** Add a short setup section to the README:
   - Install the `vault` wrapper (link to `vault` repo)
   - `vault login`
   - `vault setup --project <repo-name> --config dev`
   - `vault run -- <dev-command>`
   - How CI and runtime auth work

10. **Verify (no secret values printed).** Confirm the env var names the app
    expects are present:

    ```bash
    vault run --dry-run -- <app-start-command>   # prints env var NAMES only
    ```

    Compare against the audit from step 1. Investigate any missing keys — they
    may need to be added to the store. For runtime apps (step 7), confirm the
    HTTP read resolves the same field names (without printing values).

## Constraints

- Never print secret values, commit tokens, or hardcode credentials.
- `.vault.yaml` and `.env.example` (names only) are safe to commit. `VAULT_TOKEN`,
  `init-output.json`, and `.vault-token` are NOT — keep them out of git.
- CI must use GitHub Actions OIDC (step 6), not a stored `VAULT_TOKEN`. A static
  token is only acceptable for app runtime that cannot use the CLI or OIDC
  (step 7) — and there it must be read-only and stored as a platform secret.
- Do not add `.env` with real values to git. Add `.env` to `.gitignore` if not
  already present.
- Make the smallest changes needed; do not refactor unrelated code.

## Deliverable

When done, output:

1. A list of every file changed and why.
2. The final `.vault.yaml`.
3. The list of store-backed env vars and which config (`dev` / `prd`) each uses.
4. If the app reads secrets at runtime (step 7): the exact KV v2 read path and
   how the read-only `VAULT_TOKEN` is supplied (which platform secret).
5. The CI OIDC configuration (which secrets are pulled and into which env vars).
6. The verification result from step 10 (env var names matched / any gaps).
7. A checklist of anything left for me to do manually:
   - `vault login` / install CLI wrapper
   - Create `secret/<project>/dev` and `secret/<project>/prd` with the listed keys
   - Authorize this repo for OIDC via `setup-oidc-auth.sh` (if outside `crvouga/*`
     or if policy extension is needed)
   - Provision runtime `VAULT_TOKEN` via `create-dev-token.sh` + platform secret
     install (if step 7 applies)
