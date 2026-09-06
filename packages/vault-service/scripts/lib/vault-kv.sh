# Shared KV v2 helpers for vault repo operator scripts.
# shellcheck shell=bash

VAULT_KV_DEFAULT_MOUNT="${VAULT_KV_DEFAULT_MOUNT:-secret}"
VAULT_KV_DEFAULT_PROJECT="${VAULT_KV_DEFAULT_PROJECT:-personal}"

secret_path_for() {
  local mount="${1:?mount required}"
  local project="${2:?project required}"
  local config="${3:?config required}"
  printf '%s/%s/%s' "${mount%/}" "$project" "$config"
}

secret_exists() {
  local path="$1"
  vault_cmd kv metadata get "$path" >/dev/null 2>&1
}

read_secret_fields() {
  local path="$1"
  local raw

  if ! secret_exists "$path"; then
    echo '{}'
    return 0
  fi

  raw="$(vault_cmd kv get -format=json "$path")"
  echo "$raw" | jq -c '.data.data // {}'
}

read_secret_field() {
  local path="$1"
  local key="$2"
  read_secret_fields "$path" | jq -r --arg k "$key" '.[$k] // empty'
}

kv_patch_fields() {
  local path="$1"
  local patch_json="$2"
  local tmpfile

  tmpfile="$(mktemp)"
  chmod 600 "$tmpfile"
  echo "$patch_json" > "$tmpfile"
  vault_cmd kv patch "$path" @"$tmpfile"
  rm -f "$tmpfile"
}

redact_url_creds() {
  local url="$1"
  python3 -c '
import sys
from urllib.parse import urlparse, urlunparse
u = urlparse(sys.argv[1])
print(urlunparse((u.scheme, u.hostname or "", u.path, u.params, u.query, u.fragment)))
' "$url" 2>/dev/null || printf '%s' "$url" | sed -E 's#(postgres(ql)?://)[^@]+@#\1***:***@#'
}

normalize_database_url_for_compare() {
  local url="$1"
  python3 -c '
import sys
from urllib.parse import urlparse, urlunparse
u = urlparse(sys.argv[1])
print(urlunparse((u.scheme, u.hostname or "", u.path, u.params, u.query, u.fragment)))
' "$url" 2>/dev/null || redact_url_creds "$url"
}

assert_vault_ready() {
  require_cmd jq "Install jq: https://jqlang.github.io/jq/"
  require_cmd curl "Install curl"

  if ! export_vault_auth; then
    echo "" >&2
    echo "Authenticate with one of:" >&2
    echo "  vault login -address=\"${VAULT_ADDR}\"" >&2
    echo "  export VAULT_TOKEN='...'" >&2
    echo "  ./scripts/init.sh   # then re-run this script" >&2
    return 1
  fi

  if ! resolve_vault_bin; then
    echo "ERROR: vault CLI is required (https://openbao.org/docs/install/)" >&2
    return 1
  fi

  echo "==> Checking OpenBao health at ${VAULT_ADDR}/v1/sys/health..."
  local http_code
  http_code="$(curl -s -o /dev/null -w '%{http_code}' "${VAULT_ADDR}/v1/sys/health")"
  if [ "$http_code" != "200" ]; then
    echo "ERROR: Expected HTTP 200 from health check, got ${http_code}" >&2
    echo "OpenBao may be sealed or uninitialized. Unseal before running." >&2
    return 1
  fi
  echo "Health check passed (HTTP 200)."

  echo "==> Verifying Vault authentication..."
  if ! vault_cmd token lookup >/dev/null 2>&1; then
    echo "ERROR: VAULT_TOKEN is invalid or expired" >&2
    return 1
  fi

  return 0
}

parse_mount_project_config_args() {
  MOUNT_PATH="${VAULT_KV_DEFAULT_MOUNT}"
  PROJECT="${VAULT_KV_DEFAULT_PROJECT}"
  CONFIGS=()

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
        CONFIGS+=("$2")
        shift 2
        ;;
      *)
        return 1
        ;;
    esac
  done

  if [ "${#CONFIGS[@]}" -eq 0 ]; then
    CONFIGS=("dev" "prd")
  fi

  return 0
}
