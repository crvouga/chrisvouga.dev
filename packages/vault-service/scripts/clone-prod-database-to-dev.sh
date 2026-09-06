#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"
# shellcheck source=lib/vault-kv.sh
source "${SCRIPT_DIR}/lib/vault-kv.sh"
# shellcheck source=lib/db-connection.sh
source "${SCRIPT_DIR}/lib/db-connection.sh"
# shellcheck source=lib/pg-client.sh
source "${SCRIPT_DIR}/lib/pg-client.sh"

MOUNT_PATH="${VAULT_KV_DEFAULT_MOUNT}"
PROJECT="${VAULT_KV_DEFAULT_PROJECT}"
SOURCE_CONFIG="prd"
TARGET_CONFIG="dev"
CONFIRM=false
SCHEMA=""

SOURCE_PATH=""
TARGET_PATH=""
SOURCE_URL=""
TARGET_URL=""
DUMP_FILE=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Clone Postgres data one-way from Vault prd DATABASE_URL into dev DATABASE_URL.

Direction is hard-coded: prd → dev only. There is no reverse mode.

Default: dry-run (prints plan). Pass --confirm to dump and restore.

Options:
  --mount PATH     KV v2 mount path (default: secret)
  --project NAME   Project namespace (default: personal)
  --schema NAME    Clone only this schema (optional; default: full database)
  --confirm        Perform dump and restore (default is dry-run)
  -h, --help       Show this help

Safety:
  - Source must be Vault prd DATABASE_URL; target must be Vault dev DATABASE_URL
  - Normalized source and target URLs must differ
  - Requires explicit --confirm to write

Prerequisites:
  pg_dump, pg_restore, psql (major version must match server; brew install postgresql@18 for Neon), jq, curl, vault CLI

Examples:
  ./scripts/vault-run.sh -- ./scripts/clone-prod-database-to-dev.sh
  ./scripts/vault-run.sh -- ./scripts/clone-prod-database-to-dev.sh --schema gamezilla --confirm
EOF
}

cleanup() {
  if [ -n "$DUMP_FILE" ] && [ -f "$DUMP_FILE" ]; then
    rm -f "$DUMP_FILE"
  fi
}

assert_postgres_url() {
  local label="$1"
  local url="$2"
  if [[ "$url" != postgres://* && "$url" != postgresql://* ]]; then
    echo "ERROR: ${label} DATABASE_URL must be postgres:// or postgresql:// URL" >&2
    exit 1
  fi
}

load_vault_database_urls() {
  SOURCE_PATH="$(secret_path_for "$MOUNT_PATH" "$PROJECT" "$SOURCE_CONFIG")"
  TARGET_PATH="$(secret_path_for "$MOUNT_PATH" "$PROJECT" "$TARGET_CONFIG")"

  if ! secret_exists "$SOURCE_PATH"; then
    echo "ERROR: No secret at ${SOURCE_PATH}" >&2
    exit 1
  fi
  if ! secret_exists "$TARGET_PATH"; then
    echo "ERROR: No secret at ${TARGET_PATH}" >&2
    exit 1
  fi

  SOURCE_URL="$(read_secret_field "$SOURCE_PATH" "DATABASE_URL")"
  TARGET_URL="$(read_secret_field "$TARGET_PATH" "DATABASE_URL")"

  if [ -z "$SOURCE_URL" ]; then
    echo "ERROR: DATABASE_URL missing in ${SOURCE_PATH}" >&2
    exit 1
  fi
  if [ -z "$TARGET_URL" ]; then
    echo "ERROR: DATABASE_URL missing in ${TARGET_PATH}" >&2
    exit 1
  fi

  assert_postgres_url "source (prd)" "$SOURCE_URL"
  assert_postgres_url "target (dev)" "$TARGET_URL"
}

assert_safety_gates() {
  local source_norm target_norm

  source_norm="$(normalize_database_url_for_compare "$SOURCE_URL")"
  target_norm="$(normalize_database_url_for_compare "$TARGET_URL")"

  if [ "$source_norm" = "$target_norm" ]; then
    echo "ERROR: prd and dev DATABASE_URL resolve to the same target — refusing clone" >&2
    exit 1
  fi

  if [ -n "${DATABASE_URL:-}" ]; then
    local env_norm
    env_norm="$(normalize_database_url_for_compare "$DATABASE_URL")"
    if [ "$env_norm" = "$source_norm" ] || [ "$env_norm" = "$target_norm" ]; then
      echo "WARNING: DATABASE_URL is set in the environment; using Vault prd/dev URLs only" >&2
    fi
  fi
}

print_plan() {
  echo "==> Clone plan (prd → dev, one-way)"
  echo "    source: $(redact_url_creds "$SOURCE_URL")"
  echo "    target: $(redact_url_creds "$TARGET_URL")"
  if [ -n "$SCHEMA" ]; then
    echo "    scope:  schema ${SCHEMA} only"
  else
    echo "    scope:  full database"
  fi
  echo ""
}

run_pg_dump() {
  local output="$1"
  local -a args=(--no-owner --no-acl --format=custom)

  if [ -n "$SCHEMA" ]; then
    args+=(--schema="$SCHEMA")
  fi

  pg_dump_to_file "$SOURCE_URL" "$output" "${args[@]}"
}

run_pg_restore() {
  local input="$1"
  local -a args=(--no-owner --no-acl --clean --if-exists)

  if [ -n "$SCHEMA" ]; then
    args+=(--schema="$SCHEMA")
  fi

  pg_restore_from_file "$TARGET_URL" "$input" "${args[@]}"
}

verify_target_health() {
  psql_with_url "$TARGET_URL" -v ON_ERROR_STOP=1 -t -A -c "SELECT 1 AS ok" >/dev/null
}

drop_trailing_shell_comment_args "$@"
set -- "${DROPPED_COMMENT_ARGS[@]}"

while [ $# -gt 0 ]; do
  case "$1" in
    --mount)
      MOUNT_PATH="${2#/}"
      MOUNT_PATH="${MOUNT_PATH%/}"
      shift 2
      ;;
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --schema)
      SCHEMA="$2"
      shift 2
      ;;
    --confirm)
      CONFIRM=true
      shift
      ;;
    --source|--target|--source-config|--target-config)
      echo "ERROR: Direction is fixed at prd → dev; ${1} is not supported" >&2
      exit 1
      ;;
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
done

for cmd in pg_dump pg_restore psql; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    found=false
    for prefix in /opt/homebrew/opt/postgresql@18 /opt/homebrew/opt/postgresql@17 \
      /opt/homebrew/opt/postgresql@16 /usr/local/opt/postgresql@18 \
      /usr/local/opt/postgresql@17 /usr/local/opt/postgresql@16; do
      if [ -x "${prefix}/bin/${cmd}" ]; then
        found=true
        break
      fi
    done
    if [ "$found" = false ] && ! docker_pg_available; then
      echo "ERROR: ${cmd} is required (install PostgreSQL client tools or Docker)" >&2
      exit 1
    fi
  fi
done

if ! assert_vault_ready; then
  exit 1
fi

trap cleanup EXIT

load_vault_database_urls
assert_safety_gates
print_plan

if [ "$CONFIRM" = false ]; then
  echo "Dry-run only — re-run with --confirm to clone prd → dev"
  exit 0
fi

if ! resolve_pg_toolchain "$SOURCE_URL"; then
  exit 1
fi

echo "==> Dumping from prd..."
DUMP_FILE="$(mktemp)"
chmod 600 "$DUMP_FILE"
run_pg_dump "$DUMP_FILE"
echo "    dump size: $(wc -c < "$DUMP_FILE" | tr -d ' ') bytes"

echo "==> Restoring into dev..."
run_pg_restore "$DUMP_FILE"

echo "==> Verifying dev DATABASE_URL..."
verify_target_health

echo ""
echo "================================================================================"
echo "Clone complete: prd → dev"
echo "================================================================================"
