#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"

MOUNT_PATH="secret"
SOURCE_CONFIG="dev"
TARGET_CONFIG="prd"
DRY_RUN=false
declare -a PROJECT_FILTER=()

TMPFILE=""
PROJECTS_PROCESSED=0
PROJECTS_SKIPPED=0
PROJECTS_IN_SYNC=0
PRD_CREATED=0
PRD_PATCHED=0
PRD_OVERRIDDEN=0
TOTAL_KEYS_ADDED=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Ensure each project's prd secret contains every key from its dev secret.

For each project at <mount>/<project>/:
  - Source: <mount>/<project>/dev  (read only)
  - Target: <mount>/<project>/prd

If prd is missing or has no keys, the entire dev secret is copied into prd.
Otherwise, missing keys in prd are copied from dev. Existing prd keys are
never overwritten. Keys present only in prd are left unchanged. Never syncs
prd → dev.

Options:
  --mount PATH     KV v2 mount path (default: secret)
  --project NAME   Limit to a specific project (repeatable)
  --dry-run        List missing key names without writing to OpenBao
  -h, --help       Show this help

Environment:
  VAULT_ADDR       Vault API address (default: https://vault.chrisvouga.dev)
  VAULT_TOKEN      Vault token with write access (optional if resolved automatically)

Vault auth is resolved automatically from, in order:
  VAULT_TOKEN, vault login session, ~/.vault-token, or init-output.json

Prerequisites:
  vault CLI, jq, curl
  OpenBao initialized and unsealed
  Token with write access to secret/data/* (root or admin policy)

Examples:
  ./scripts/vault-run.sh -- ./scripts/sync-dev-keys-to-prd.sh --dry-run
  ./scripts/vault-run.sh -- ./scripts/sync-dev-keys-to-prd.sh
  ./scripts/sync-dev-keys-to-prd.sh --project personal
EOF
}

cleanup() {
  if [ -n "$TMPFILE" ] && [ -f "$TMPFILE" ]; then
    rm -f "$TMPFILE"
  fi
}

secret_exists() {
  local path="$1"
  vault_cmd kv metadata get "$path" >/dev/null 2>&1
}

list_projects() {
  local projects_json
  projects_json="$(vault_cmd kv list -format=json "${MOUNT_PATH}/" 2>/dev/null || echo '[]')"

  if [ "${#PROJECT_FILTER[@]}" -gt 0 ]; then
    local filter_json
    filter_json="$(printf '%s\n' "${PROJECT_FILTER[@]}" | jq -R . | jq -s .)"
    echo "$projects_json" | jq -r --argjson filter "$filter_json" '
      if type == "array" then . else [] end
      | .[]
      | rtrimstr("/")
      | select(. as $p | $filter | index($p))
    '
  else
    echo "$projects_json" | jq -r '
      if type == "array" then . else [] end
      | .[]
      | rtrimstr("/")
    '
  fi
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

while [ $# -gt 0 ]; do
  case "$1" in
    --mount)
      if [ $# -lt 2 ]; then
        echo "ERROR: --mount requires a path argument" >&2
        exit 1
      fi
      MOUNT_PATH="${2#/}"
      MOUNT_PATH="${MOUNT_PATH%/}"
      shift 2
      ;;
    --project)
      if [ $# -lt 2 ]; then
        echo "ERROR: --project requires a name argument" >&2
        exit 1
      fi
      PROJECT_FILTER+=("$2")
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
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

require_cmd jq "Install jq: https://jqlang.github.io/jq/"
require_cmd curl "Install curl"

if ! export_vault_auth; then
  echo "" >&2
  echo "Authenticate with one of:" >&2
  echo "  vault login -address=\"${VAULT_ADDR}\"" >&2
  echo "  export VAULT_TOKEN='...'" >&2
  echo "  ./scripts/init.sh   # then re-run this script" >&2
  exit 1
fi

if ! resolve_vault_bin; then
  echo "ERROR: vault CLI is required (https://openbao.org/docs/install/)" >&2
  exit 1
fi

trap cleanup EXIT

TMPFILE="$(mktemp)"
chmod 600 "$TMPFILE"

echo "==> Checking OpenBao health at ${VAULT_ADDR}/v1/sys/health..."
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${VAULT_ADDR}/v1/sys/health")"
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Expected HTTP 200 from health check, got ${HTTP_CODE}" >&2
  echo "OpenBao may be sealed or uninitialized. Unseal before syncing." >&2
  exit 1
fi
echo "Health check passed (HTTP 200)."

echo "==> Verifying Vault authentication..."
if ! vault_cmd token lookup >/dev/null 2>&1; then
  echo "ERROR: VAULT_TOKEN is invalid or expired" >&2
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "==> Dry run mode — no secrets will be written to OpenBao"
else
  echo "==> Syncing ${SOURCE_CONFIG} into ${TARGET_CONFIG} (full copy when empty; otherwise add missing keys only)"
fi

echo "==> Enumerating projects under ${MOUNT_PATH}/..."
mapfile -t PROJECTS < <(list_projects)

if [ "${#PROJECTS[@]}" -eq 0 ]; then
  if [ "${#PROJECT_FILTER[@]}" -gt 0 ]; then
    echo "ERROR: No matching projects found for: ${PROJECT_FILTER[*]}" >&2
  else
    echo "ERROR: No projects found under ${MOUNT_PATH}/" >&2
  fi
  exit 1
fi

echo "Found ${#PROJECTS[@]} project(s): ${PROJECTS[*]}"
echo ""

for project in "${PROJECTS[@]}"; do
  dev_path="${MOUNT_PATH}/${project}/${SOURCE_CONFIG}"
  prd_path="${MOUNT_PATH}/${project}/${TARGET_CONFIG}"

  if ! secret_exists "$dev_path"; then
    echo "==> ${project}: skipped (no ${SOURCE_CONFIG} secret at ${dev_path})"
    PROJECTS_SKIPPED=$((PROJECTS_SKIPPED + 1))
    continue
  fi

  dev_fields="$(read_secret_fields "$dev_path")"
  prd_fields="$(read_secret_fields "$prd_path")"

  dev_key_count="$(echo "$dev_fields" | jq 'length')"
  prd_key_count="$(echo "$prd_fields" | jq 'length')"
  if [ "$dev_key_count" -eq 0 ]; then
    echo "==> ${project}: skipped (${SOURCE_CONFIG} secret has no keys)"
    PROJECTS_SKIPPED=$((PROJECTS_SKIPPED + 1))
    continue
  fi

  PROJECTS_PROCESSED=$((PROJECTS_PROCESSED + 1))

  if [ "$prd_key_count" -eq 0 ]; then
    echo "$dev_fields" > "$TMPFILE"
    key_names="$(jq -r 'keys | join(", ")' "$TMPFILE")"

    if [ "$DRY_RUN" = true ]; then
      echo "==> ${project}/${TARGET_CONFIG}: would copy all ${dev_key_count} key(s) from ${SOURCE_CONFIG} (empty ${TARGET_CONFIG}): ${key_names}"
    else
      echo "==> ${project}/${TARGET_CONFIG}: copying all ${dev_key_count} key(s) from ${SOURCE_CONFIG} (empty ${TARGET_CONFIG}): ${key_names}"
      vault_cmd kv put "$prd_path" @"$TMPFILE"
      PRD_OVERRIDDEN=$((PRD_OVERRIDDEN + 1))
    fi

    TOTAL_KEYS_ADDED=$((TOTAL_KEYS_ADDED + dev_key_count))
    continue
  fi

  jq -n --argjson dev "$dev_fields" --argjson prd "$prd_fields" \
    '$dev | with_entries(select(.key as $k | ($prd | has($k)) | not))' > "$TMPFILE"

  missing_count="$(jq 'length' "$TMPFILE")"
  prd_only_count="$(jq -n --argjson dev "$dev_fields" --argjson prd "$prd_fields" \
    '$prd | keys | map(select(. as $k | ($dev | has($k)) | not)) | length')"

  if [ "$missing_count" -eq 0 ]; then
    echo "==> ${project}/${TARGET_CONFIG}: up to date (${dev_key_count} key(s) in ${SOURCE_CONFIG})"
    if [ "$prd_only_count" -gt 0 ]; then
      echo "    (${prd_only_count} key(s) in ${TARGET_CONFIG} only — left unchanged)"
    fi
    PROJECTS_IN_SYNC=$((PROJECTS_IN_SYNC + 1))
    continue
  fi

  key_names="$(jq -r 'keys | join(", ")' "$TMPFILE")"

  if [ "$DRY_RUN" = true ]; then
    echo "==> ${project}/${TARGET_CONFIG}: would add ${missing_count} key(s): ${key_names}"
  elif secret_exists "$prd_path"; then
    echo "==> ${project}/${TARGET_CONFIG}: adding ${missing_count} key(s): ${key_names}"
    vault_cmd kv patch "$prd_path" @"$TMPFILE"
    PRD_PATCHED=$((PRD_PATCHED + 1))
  else
    echo "==> ${project}/${TARGET_CONFIG}: creating with ${missing_count} key(s): ${key_names}"
    vault_cmd kv put "$prd_path" @"$TMPFILE"
    PRD_CREATED=$((PRD_CREATED + 1))
  fi

  if [ "$prd_only_count" -gt 0 ]; then
    echo "    (${prd_only_count} key(s) in ${TARGET_CONFIG} only — left unchanged)"
  fi

  TOTAL_KEYS_ADDED=$((TOTAL_KEYS_ADDED + missing_count))
done

echo ""
echo "================================================================================"
if [ "$DRY_RUN" = true ]; then
  echo "Dry run complete — no secrets were written"
else
  echo "Sync complete"
fi
echo "================================================================================"
echo ""
echo "Projects processed:  ${PROJECTS_PROCESSED}"
echo "Projects skipped:    ${PROJECTS_SKIPPED} (no ${SOURCE_CONFIG} secret or empty)"
echo "Projects in sync:    ${PROJECTS_IN_SYNC}"
echo "Prd secrets created: ${PRD_CREATED}"
echo "Prd secrets patched: ${PRD_PATCHED}"
echo "Prd secrets replaced (empty): ${PRD_OVERRIDDEN}"
echo "Keys added to prd:   ${TOTAL_KEYS_ADDED}"
echo "Mount:               ${MOUNT_PATH}/"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "Re-run without --dry-run to write missing keys to prd."
else
  echo "Verify a secret:"
  echo "  vault kv get -format=json ${MOUNT_PATH}/<project>/${TARGET_CONFIG}"
fi
