#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"
# shellcheck source=lib/vault-kv.sh
source "${SCRIPT_DIR}/lib/vault-kv.sh"

MOUNT_PATH="${VAULT_KV_DEFAULT_MOUNT}"
PROJECT="${VAULT_KV_DEFAULT_PROJECT}"
DRY_RUN=false
declare -a CONFIGS=("dev" "prd")

SOURCE_KEYS=(
  B2_BUCKET
  B2_S3_ACCESS_KEY_ID
  B2_S3_ACCESS_KEY_ID
  B2_S3_ENDPOINT
  B2_S3_REGION
  B2_S3_SECRET_ACCESS_KEY
  B2_S3_SECRET_ACCESS_KEY
)
TARGET_KEYS=(
  S3_BUCKET
  S3_ACCESS_KEY_ID
  S3_ACCESS_KEY
  S3_ENDPOINT
  S3_REGION
  S3_SECRET_ACCESS_KEY
  S3_SECRET_KEY
)

TMPFILE=""
CONFIGS_PROCESSED=0
CONFIGS_SKIPPED=0
TOTAL_KEYS_WRITTEN=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Copy B2_* secret fields to S3_* names in the same KV path (pure aliases).

Mappings:
  B2_BUCKET               -> S3_BUCKET
  B2_S3_ACCESS_KEY_ID     -> S3_ACCESS_KEY_ID, S3_ACCESS_KEY
  B2_S3_ENDPOINT          -> S3_ENDPOINT
  B2_S3_REGION            -> S3_REGION
  B2_S3_SECRET_ACCESS_KEY -> S3_SECRET_ACCESS_KEY, S3_SECRET_KEY

Default paths: secret/personal/dev and secret/personal/prd

Existing S3_* keys are overwritten with values from the matching B2_* source.
Source B2_* keys are left unchanged.

Options:
  --mount PATH      KV v2 mount path (default: secret)
  --project NAME    Project namespace (default: personal)
  --config NAME     Config to process (repeatable; default: dev and prd)
  --dry-run         Show what would be written without patching OpenBao
  -h, --help        Show this help

Environment:
  VAULT_ADDR        Vault API address (default: https://vault.chrisvouga.dev)
  VAULT_TOKEN       Vault token with write access (optional if resolved automatically)

Prerequisites:
  vault CLI, jq, curl
  OpenBao initialized and unsealed
  Token with write access to secret/data/<project>/*

Examples:
  ./scripts/vault-run.sh -- ./scripts/create-s3-secrets-from-b2.sh --dry-run
  ./scripts/vault-run.sh -- ./scripts/create-s3-secrets-from-b2.sh
  ./scripts/create-s3-secrets-from-b2.sh --config dev
EOF
}

cleanup() {
  if [ -n "$TMPFILE" ] && [ -f "$TMPFILE" ]; then
    rm -f "$TMPFILE"
  fi
}

build_patch_json() {
  local fields="$1"
  local patch='{}'
  local i source_key target_key value

  for i in "${!SOURCE_KEYS[@]}"; do
    source_key="${SOURCE_KEYS[$i]}"
    target_key="${TARGET_KEYS[$i]}"
    value="$(echo "$fields" | jq -r --arg k "$source_key" '.[$k] // empty')"
    if [ -n "$value" ]; then
      patch="$(echo "$patch" | jq -c --arg k "$target_key" --arg v "$value" '. + {($k): $v}')"
    fi
  done

  echo "$patch"
}

missing_source_keys() {
  local fields="$1"
  local missing=()
  local seen=()
  local i source_key

  for i in "${!SOURCE_KEYS[@]}"; do
    source_key="${SOURCE_KEYS[$i]}"
    local already=false
    local key
    for key in "${seen[@]}"; do
      if [ "$key" = "$source_key" ]; then
        already=true
        break
      fi
    done
    if [ "$already" = true ]; then
      continue
    fi
    seen+=("$source_key")
    if ! echo "$fields" | jq -e --arg k "$source_key" 'has($k)' >/dev/null; then
      missing+=("$source_key")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    printf '%s' "${missing[0]}"
    local key
    for key in "${missing[@]:1}"; do
      printf ', %s' "$key"
    done
  fi
}

drop_trailing_shell_comment_args "$@"
set -- "${DROPPED_COMMENT_ARGS[@]}"

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
      PROJECT="$2"
      shift 2
      ;;
    --config)
      if [ $# -lt 2 ]; then
        echo "ERROR: --config requires a name argument" >&2
        exit 1
      fi
      if [ "${CONFIGS[0]}" = "dev" ] && [ "${CONFIGS[1]:-}" = "prd" ] && [ "${#CONFIGS[@]}" -eq 2 ]; then
        CONFIGS=()
      fi
      CONFIGS+=("$2")
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

if ! assert_vault_ready; then
  exit 1
fi

trap cleanup EXIT

TMPFILE="$(mktemp)"
chmod 600 "$TMPFILE"

if [ "$DRY_RUN" = true ]; then
  echo "==> Dry run mode — no secrets will be written to OpenBao"
else
  echo "==> Creating S3_* secrets from B2_* sources (overwriting existing S3_* keys)"
fi

echo "==> Processing ${#CONFIGS[@]} config(s) under ${MOUNT_PATH}/${PROJECT}/..."
echo ""

ANY_SUCCESS=false

for config in "${CONFIGS[@]}"; do
  secret_path="$(secret_path_for "$MOUNT_PATH" "$PROJECT" "$config")"

  if ! secret_exists "$secret_path"; then
    echo "==> ${PROJECT}/${config}: skipped (no secret at ${secret_path})"
    CONFIGS_SKIPPED=$((CONFIGS_SKIPPED + 1))
    continue
  fi

  fields="$(read_secret_fields "$secret_path")"
  patch_json="$(build_patch_json "$fields")"
  patch_count="$(echo "$patch_json" | jq 'length')"
  missing_sources="$(missing_source_keys "$fields")"

  if [ "$patch_count" -eq 0 ]; then
    echo "==> ${PROJECT}/${config}: skipped (no B2_* source keys found)"
    if [ -n "$missing_sources" ]; then
      echo "    missing source: ${missing_sources}"
    fi
    CONFIGS_SKIPPED=$((CONFIGS_SKIPPED + 1))
    continue
  fi

  CONFIGS_PROCESSED=$((CONFIGS_PROCESSED + 1))
  ANY_SUCCESS=true
  key_names="$(echo "$patch_json" | jq -r 'keys | join(", ")')"

  if [ "$DRY_RUN" = true ]; then
    echo "==> ${PROJECT}/${config}: would set ${patch_count} key(s): ${key_names}"
    if [ -n "$missing_sources" ]; then
      echo "    missing source: ${missing_sources}"
    fi
  else
    echo "$patch_json" > "$TMPFILE"
    echo "==> ${PROJECT}/${config}: setting ${patch_count} key(s): ${key_names}"
    if [ -n "$missing_sources" ]; then
      echo "    missing source: ${missing_sources}"
    fi
    kv_patch_fields "$secret_path" "$patch_json"
  fi

  TOTAL_KEYS_WRITTEN=$((TOTAL_KEYS_WRITTEN + patch_count))
done

echo ""
echo "================================================================================"
if [ "$DRY_RUN" = true ]; then
  echo "Dry run complete — no secrets were written"
else
  echo "Complete"
fi
echo "================================================================================"
echo ""
echo "Configs processed: ${CONFIGS_PROCESSED}"
echo "Configs skipped:   ${CONFIGS_SKIPPED}"
echo "Keys written:      ${TOTAL_KEYS_WRITTEN}"
echo "Project:           ${PROJECT}"
echo "Mount:             ${MOUNT_PATH}/"
echo ""

if [ "$ANY_SUCCESS" = false ]; then
  echo "ERROR: No configs were processed successfully." >&2
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "Re-run without --dry-run to write S3_* keys."
else
  echo "Verify:"
  echo "  vault kv get ${MOUNT_PATH}/${PROJECT}/dev"
  echo "  vault kv get ${MOUNT_PATH}/${PROJECT}/prd"
fi
