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

MOUNT_PATH="${VAULT_KV_DEFAULT_MOUNT}"
PROJECT="${VAULT_KV_DEFAULT_PROJECT}"
JSON_OUTPUT=false
declare -a CONFIGS=("dev" "prd")

CHECKS_PASSED=0
CHECKS_FAILED=0

declare -a RESULT_LINES=()

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Verify DATABASE_URL in Vault dev and prd configs is present, well-formed, and
reachable (SELECT 1 via psql).

Options:
  --mount PATH     KV v2 mount path (default: secret)
  --project NAME   Project namespace (default: personal)
  --config NAME    Config to check (repeatable; default: dev and prd)
  --json           Emit machine-readable JSON on stdout
  -h, --help       Show this help

Prerequisites:
  psql, jq, curl, vault CLI

Examples:
  ./scripts/vault-run.sh -- ./scripts/check-database-url-health.sh
  ./scripts/check-database-url-health.sh --config prd
EOF
}

record_result() {
  local config="$1"
  local status="$2"
  local host="$3"
  local duration_ms="$4"
  local detail="$5"

  case "$status" in
    pass) CHECKS_PASSED=$((CHECKS_PASSED + 1)) ;;
    fail) CHECKS_FAILED=$((CHECKS_FAILED + 1)) ;;
  esac

  RESULT_LINES+=("$(jq -nc \
    --arg config "$config" \
    --arg status "$status" \
    --arg host "$host" \
    --argjson durationMs "$duration_ms" \
    --arg detail "$detail" \
    '{config: $config, status: $status, host: $host, durationMs: $durationMs, detail: $detail}')")
}

is_postgres_wire_url() {
  local url="$1"
  [[ "$url" == postgres://* || "$url" == postgresql://* ]]
}

probe_database_url() {
  local url="$1"
  local start end duration_ms host redacted

  start="$(python3 -c 'import time; print(int(time.time() * 1000))')"
  host="$(python3 -c 'import sys; from urllib.parse import urlparse; print(urlparse(sys.argv[1]).hostname or "")' "$url")"
  redacted="$(redact_url_creds "$url")"

  export DB_CONNECTION_URI
  DB_CONNECTION_URI="$(prepare_db_connection_uri "$url")"

  if psql_with_retry -v ON_ERROR_STOP=1 -t -A -c "SELECT 1 AS ok" >/dev/null 2>&1; then
    end="$(python3 -c 'import time; print(int(time.time() * 1000))')"
    duration_ms=$((end - start))
    printf 'pass\n%s\n%s\n%s' "$host" "$duration_ms" "SELECT 1 ok (${redacted})"
    return 0
  fi

  end="$(python3 -c 'import time; print(int(time.time() * 1000))')"
  duration_ms=$((end - start))
  printf 'fail\n%s\n%s\n%s' "$host" "$duration_ms" "SELECT 1 failed (${redacted})"
  return 1
}

check_config() {
  local config="$1"
  local secret_path url host status duration_ms detail

  secret_path="$(secret_path_for "$MOUNT_PATH" "$PROJECT" "$config")"

  if ! secret_exists "$secret_path"; then
    record_result "$config" "fail" "" 0 "no secret at ${secret_path}"
    if [ "$JSON_OUTPUT" = false ]; then
      echo "  FAIL  ${config}: no secret at ${secret_path}"
    fi
    return 1
  fi

  url="$(read_secret_field "$secret_path" "DATABASE_URL")"
  if [ -z "$url" ]; then
    record_result "$config" "fail" "" 0 "DATABASE_URL missing"
    if [ "$JSON_OUTPUT" = false ]; then
      echo "  FAIL  ${config}: DATABASE_URL missing"
    fi
    return 1
  fi

  if ! is_postgres_wire_url "$url"; then
    record_result "$config" "fail" "" 0 "DATABASE_URL is not postgres:// or postgresql://"
    if [ "$JSON_OUTPUT" = false ]; then
      echo "  FAIL  ${config}: DATABASE_URL is not a Postgres wire URL"
    fi
    return 1
  fi

  if ! command -v psql >/dev/null 2>&1; then
    record_result "$config" "fail" "" 0 "psql is not installed"
    if [ "$JSON_OUTPUT" = false ]; then
      echo "  FAIL  ${config}: psql is not installed"
    fi
    return 1
  fi

  mapfile -t probe < <(probe_database_url "$url" || true)
  status="${probe[0]:-fail}"
  host="${probe[1]:-}"
  duration_ms="${probe[2]:-0}"
  detail="${probe[3]:-probe failed}"

  record_result "$config" "$status" "$host" "$duration_ms" "$detail"

  if [ "$JSON_OUTPUT" = false ]; then
    if [ "$status" = "pass" ]; then
      echo "  OK    ${config}: ${detail} [${duration_ms}ms]"
    else
      echo "  FAIL  ${config}: ${detail}"
    fi
  fi

  [ "$status" = "pass" ]
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
    --config)
      if [ "${CONFIGS[0]}" = "dev" ] && [ "${CONFIGS[1]:-}" = "prd" ] && [ "${#CONFIGS[@]}" -eq 2 ]; then
        CONFIGS=()
      fi
      CONFIGS+=("$2")
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
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

if ! assert_vault_ready; then
  exit 1
fi

if [ "$JSON_OUTPUT" = false ]; then
  echo "==> Checking DATABASE_URL health for ${PROJECT} (${CONFIGS[*]})"
  echo ""
fi

for config in "${CONFIGS[@]}"; do
  check_config "$config" || true
done

if [ "$JSON_OUTPUT" = true ]; then
  jq -nc \
    --arg project "$PROJECT" \
    --arg mount "$MOUNT_PATH" \
    --argjson results "$(printf '%s\n' "${RESULT_LINES[@]}" | jq -s '.')" \
    --argjson passed "$CHECKS_PASSED" \
    --argjson failed "$CHECKS_FAILED" \
    '{project: $project, mount: $mount, passed: $passed, failed: $failed, results: $results}'
else
  echo ""
  echo "================================================================================"
  echo "Passed: ${CHECKS_PASSED}"
  echo "Failed: ${CHECKS_FAILED}"
  echo "================================================================================"
fi

if [ "$CHECKS_FAILED" -gt 0 ]; then
  exit 1
fi
