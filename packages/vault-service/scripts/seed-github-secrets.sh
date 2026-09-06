#!/usr/bin/env bash
set -euo pipefail

SKIP_VAULT=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
ENV_SECRETS_FILE="${REPO_ROOT}/.env.secrets"
INIT_OUTPUT_FILE="${REPO_ROOT}/init-output.json"

NEON_CMD=()
declare -a SECRET_SOURCES=()

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Fetch deploy pipeline secrets from authenticated CLIs and seed GitHub Actions
secrets. No manual entry required when logged in to each provider.

Options:
  --skip-vault   Do not fetch or set VAULT_TOKEN
  -h, --help     Show this help

Log in first:
  gh auth login
  neonctl auth       # npm i -g neonctl  (or: npx neonctl auth)

Cloudflare requires a dashboard API token (Wrangler OAuth does not work):
  Create at https://dash.cloudflare.com/profile/api-tokens (Zone:DNS:Edit for chrisvouga.dev)
  export CLOUDFLARE_API_TOKEN='...'  or add to .env / .env.secrets

Optional overrides (env vars, ${ENV_FILE}, or ${ENV_SECRETS_FILE}):
  NEON_PROJECT_ID, CF_API_TOKEN, CLOUDFLARE_API_TOKEN,
  DB_CONNECTION_URI, RAILWAY_TOKEN, VAULT_TOKEN

Required GitHub secrets: CF_API_TOKEN, DB_CONNECTION_URI, RAILWAY_TOKEN
Optional GitHub secret:  VAULT_TOKEN (from init-output.json after init.sh)
EOF
}

record_source() {
  SECRET_SOURCES+=("$1")
}

require_cmd() {
  local cmd="$1"
  local install_hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: ${cmd} is required. ${install_hint}" >&2
    exit 1
  fi
}

resolve_neon_cmd() {
  if [ "${#NEON_CMD[@]}" -gt 0 ]; then
    return 0
  fi

  if command -v neon >/dev/null 2>&1; then
    NEON_CMD=(neon)
  elif command -v neonctl >/dev/null 2>&1; then
    NEON_CMD=(neonctl)
  elif command -v npx >/dev/null 2>&1; then
    echo "==> neonctl not installed globally; using npx neonctl"
    NEON_CMD=(npx --yes neonctl)
  else
    echo "ERROR: neon CLI not found. Install: npm i -g neonctl" >&2
    echo "       Or ensure npm/npx is available and run: npx neonctl auth" >&2
    exit 1
  fi
}

run_neon() {
  resolve_neon_cmd
  "${NEON_CMD[@]}" "$@"
}

resolve_neon_project_id() {
  if [ -n "${NEON_PROJECT_ID:-}" ]; then
    echo "$NEON_PROJECT_ID"
    return 0
  fi

  local projects_json project_count project_id
  projects_json="$(run_neon projects list --output json)"
  project_count="$(echo "$projects_json" | jq -r 'if type == "array" then length elif .projects then (.projects | length) else 0 end')"
  if [ "$project_count" -eq 1 ]; then
    project_id="$(echo "$projects_json" | jq -r 'if type == "array" then .[0].id else .projects[0].id end')"
    echo "$project_id"
    return 0
  fi

  if [ "$project_count" -gt 1 ]; then
    echo "ERROR: Multiple Neon projects found. Run 'neonctl set-context' or set NEON_PROJECT_ID." >&2
    exit 1
  fi

  echo "ERROR: No Neon projects found. Create a project in Neon or set NEON_PROJECT_ID." >&2
  exit 1
}

fetch_cf_api_token() {
  if [ -n "${CF_API_TOKEN:-}" ]; then
    CF_API_TOKEN="$(printf '%s' "$CF_API_TOKEN" | tr -d '\n\r')"
    record_source "CF_API_TOKEN (environment override)"
    return 0
  fi

  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    CF_API_TOKEN="$(printf '%s' "$CLOUDFLARE_API_TOKEN" | tr -d '\n\r')"
    record_source "CF_API_TOKEN (CLOUDFLARE_API_TOKEN)"
    return 0
  fi

  echo "ERROR: Cloudflare API token required for DNS provisioning in CI." >&2
  echo "" >&2
  echo "Wrangler OAuth tokens cannot be used with the Cloudflare REST API." >&2
  echo "Create a token at: https://dash.cloudflare.com/profile/api-tokens" >&2
  echo "  Template: Edit zone DNS" >&2
  echo "  Zone: chrisvouga.dev" >&2
  echo "" >&2
  echo "Then either:" >&2
  echo "  export CLOUDFLARE_API_TOKEN='...' && ./scripts/seed-github-secrets.sh" >&2
  echo "  or add CLOUDFLARE_API_TOKEN=... to .env or .env.secrets" >&2
  exit 1
}

load_env_file() {
  local file="$1"
  if [ -f "$file" ]; then
    echo "==> Loading $(basename "$file")"
    set -a
    # shellcheck source=/dev/null
    source "$file"
    set +a
  fi
}

verify_cf_api_token() {
  local response http_code
  response="$(curl -sS -w "\n__HTTP_CODE__:%{http_code}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/user/tokens/verify")"
  http_code="${response##*__HTTP_CODE__:}"
  response="${response%__HTTP_CODE__:*}"

  if [ "$http_code" != "200" ]; then
    echo "ERROR: Cloudflare token verification failed (HTTP ${http_code})" >&2
    echo "$response" | jq . >&2 2>/dev/null || echo "$response" >&2
    exit 1
  fi

  if ! echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
    echo "ERROR: Cloudflare token is invalid or lacks required permissions" >&2
    echo "$response" | jq . >&2
    exit 1
  fi

  echo "==> Cloudflare API token verified"
}

fetch_db_connection_uri() {
  if [ -n "${DB_CONNECTION_URI:-}" ]; then
    record_source "DB_CONNECTION_URI (environment override)"
    return 0
  fi

  resolve_neon_cmd
  if ! run_neon me >/dev/null 2>&1; then
    echo "ERROR: Neon CLI is not authenticated. Run: neonctl auth" >&2
    echo "       (or: npx neonctl auth)" >&2
    exit 1
  fi

  local project_id
  if [ -n "${NEON_PROJECT_ID:-}" ]; then
    project_id="$NEON_PROJECT_ID"
    echo "==> Fetching DB_CONNECTION_URI from neon connection-string (NEON_PROJECT_ID)"
  elif DB_CONNECTION_URI="$(run_neon connection-string --endpoint-type read_write 2>/dev/null || true)" \
    && [ -n "$DB_CONNECTION_URI" ]; then
    echo "==> Fetching DB_CONNECTION_URI from neon connection-string (CLI context)"
    record_source "DB_CONNECTION_URI (neon connection-string, CLI context)"
    return 0
  else
    project_id="$(resolve_neon_project_id)"
    echo "==> Fetching DB_CONNECTION_URI from neon connection-string (project ${project_id})"
  fi

  DB_CONNECTION_URI="$(run_neon connection-string --project-id "$project_id" --endpoint-type read_write)"
  record_source "DB_CONNECTION_URI (neon connection-string)"
}

fetch_vault_token() {
  if [ "$SKIP_VAULT" = true ]; then
    return 0
  fi

  if [ -n "${VAULT_TOKEN:-}" ]; then
    record_source "VAULT_TOKEN (environment override)"
    return 0
  fi

  if [ ! -f "$INIT_OUTPUT_FILE" ]; then
    return 0
  fi

  require_cmd jq "Install jq: https://jqlang.github.io/jq/"
  echo "==> Fetching VAULT_TOKEN from init-output.json"
  VAULT_TOKEN="$(jq -r '.root_token // empty' "$INIT_OUTPUT_FILE")"
  if [ -n "$VAULT_TOKEN" ] && [ "$VAULT_TOKEN" != "null" ]; then
    record_source "VAULT_TOKEN (init-output.json)"
  else
    VAULT_TOKEN=""
  fi
}

fetch_railway_token() {
  if [ -n "${RAILWAY_TOKEN:-}" ]; then
    record_source "RAILWAY_TOKEN (environment override)"
    return 0
  fi

  local infra_railway_token="${REPO_ROOT}/../.railway-token"
  if [ -f "$infra_railway_token" ]; then
    echo "==> Fetching RAILWAY_TOKEN from ${infra_railway_token}"
    RAILWAY_TOKEN="$(tr -d '[:space:]' < "$infra_railway_token")"
    record_source "RAILWAY_TOKEN (../.railway-token)"
    return 0
  fi

  echo "ERROR: RAILWAY_TOKEN is required." >&2
  echo "       export RAILWAY_TOKEN=... or write token to infra/.railway-token" >&2
  exit 1
}

assert_non_empty() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "ERROR: ${name} is empty after fetch" >&2
    exit 1
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-vault) SKIP_VAULT=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_cmd gh "Install: https://cli.github.com/"
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

GITHUB_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [ -z "$GITHUB_REPO" ]; then
  echo "ERROR: Could not detect GitHub repo. Run from a linked git repository." >&2
  exit 1
fi

load_env_file "$ENV_FILE"
load_env_file "$ENV_SECRETS_FILE"

echo "==> GitHub repository: ${GITHUB_REPO}"
echo ""

fetch_cf_api_token
verify_cf_api_token
fetch_db_connection_uri
fetch_railway_token
fetch_vault_token

assert_non_empty CF_API_TOKEN "$CF_API_TOKEN"
assert_non_empty DB_CONNECTION_URI "$DB_CONNECTION_URI"
assert_non_empty RAILWAY_TOKEN "$RAILWAY_TOKEN"

echo ""
echo "==> Setting GitHub Actions secrets..."
gh secret set CF_API_TOKEN --body "$CF_API_TOKEN" --repo "$GITHUB_REPO"
gh secret set DB_CONNECTION_URI --body "$DB_CONNECTION_URI" --repo "$GITHUB_REPO"
gh secret set RAILWAY_TOKEN --body "$RAILWAY_TOKEN" --repo "$GITHUB_REPO"

GITHUB_SET=(CF_API_TOKEN DB_CONNECTION_URI RAILWAY_TOKEN)

if [ -n "${VAULT_TOKEN:-}" ]; then
  gh secret set VAULT_TOKEN --body "$VAULT_TOKEN" --repo "$GITHUB_REPO"
  GITHUB_SET+=(VAULT_TOKEN)
fi

echo ""
echo "================================================================================"
echo "Secrets seeded successfully (values not shown)"
echo "================================================================================"
echo ""
echo "Sources:"
for entry in "${SECRET_SOURCES[@]}"; do
  echo "  - ${entry}"
done
echo ""
echo "GitHub Actions secrets (${GITHUB_REPO}):"
for name in "${GITHUB_SET[@]}"; do
  echo "  - ${name}"
done
echo ""
if [ -z "${VAULT_TOKEN:-}" ]; then
  echo "Note: VAULT_TOKEN was not set. Smoke tests will skip until you run init.sh"
  echo "      and re-run: ./scripts/seed-github-secrets.sh"
fi
