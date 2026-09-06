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
LEGACY_FILE="${REPO_ROOT}/legacy-b2.json"
CONFIRM=false
SEED_VAULT_SECRETS=false
OVERWRITE_SECRETS=false
declare -a CONFIGS=("dev" "prd")

B2_S3_KEYS=(
  B2_BUCKET
  B2_S3_ACCESS_KEY_ID
  B2_S3_SECRET_ACCESS_KEY
  B2_S3_ENDPOINT
  B2_S3_REGION
)

LEGACY_B2_KEYS=(
  B2_APP_KEY
  B2_APP_KEY_ID
  B2_APP_KEY_NAME
  B2_BUCKET
  B2_S3_ACCESS_KEY_ID
  B2_S3_ENDPOINT
  B2_S3_REGION
  B2_S3_SECRET_ACCESS_KEY
)

CONFIGS_PROCESSED=0
CONFIGS_SKIPPED=0
CONFIGS_FAILED=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Sync all objects from the legacy B2 bucket (legacy-b2.json) into the B2
buckets configured in Vault dev and prd secrets.

Source credentials come from --legacy-file (default: repo-root legacy-b2.json).
Target credentials are read from secret/<project>/<config> using the same
B2_* field names as the legacy file.

Default: dry-run (prints sync plan). Pass --confirm to copy objects.

Options:
  --legacy-file PATH   Source B2 credentials JSON (default: ./legacy-b2.json)
  --mount PATH         KV v2 mount path (default: secret)
  --project NAME       Project namespace (default: personal)
  --config NAME        Config to process (repeatable; default: dev and prd)
  --seed-vault-secrets Patch legacy B2_* keys into Vault before syncing
  --overwrite-secrets  With --seed-vault-secrets, overwrite existing B2_* keys
  --confirm            Perform the sync (default is dry-run only)
  -h, --help           Show this help

Environment:
  VAULT_ADDR           Vault API address
  VAULT_TOKEN          Vault token with read (and write if seeding)

Prerequisites:
  aws CLI, jq, curl, vault CLI
  OpenBao initialized and unsealed

Examples:
  ./scripts/vault-run.sh -- ./scripts/clone-b2-bucket-from-legacy.sh
  ./scripts/vault-run.sh -- ./scripts/clone-b2-bucket-from-legacy.sh --confirm
  ./scripts/vault-run.sh -- ./scripts/clone-b2-bucket-from-legacy.sh --seed-vault-secrets --confirm
EOF
}

read_legacy_fields() {
  if [ ! -f "$LEGACY_FILE" ]; then
    echo "ERROR: Legacy file not found: ${LEGACY_FILE}" >&2
    return 1
  fi
  jq -c '.' "$LEGACY_FILE"
}

extract_s3_creds() {
  local fields="$1"
  local prefix="$2"
  local bucket access_key secret_key endpoint region

  bucket="$(echo "$fields" | jq -r --arg p "${prefix}B2_BUCKET" '.[$p] // .B2_BUCKET // empty')"
  access_key="$(echo "$fields" | jq -r --arg p "${prefix}B2_S3_ACCESS_KEY_ID" '.[$p] // .B2_S3_ACCESS_KEY_ID // empty')"
  secret_key="$(echo "$fields" | jq -r --arg p "${prefix}B2_S3_SECRET_ACCESS_KEY" '.[$p] // .B2_S3_SECRET_ACCESS_KEY // empty')"
  endpoint="$(echo "$fields" | jq -r --arg p "${prefix}B2_S3_ENDPOINT" '.[$p] // .B2_S3_ENDPOINT // empty')"
  region="$(echo "$fields" | jq -r --arg p "${prefix}B2_S3_REGION" '.[$p] // .B2_S3_REGION // empty')"

  if [ -z "$bucket" ] || [ -z "$access_key" ] || [ -z "$secret_key" ] || [ -z "$endpoint" ] || [ -z "$region" ]; then
    return 1
  fi

  printf '%s\n%s\n%s\n%s\n%s' "$bucket" "$access_key" "$secret_key" "$endpoint" "$region"
}

build_legacy_seed_patch() {
  local legacy_fields="$1"
  local vault_fields="$2"
  local patch='{}'
  local key value

  for key in "${LEGACY_B2_KEYS[@]}"; do
    value="$(echo "$legacy_fields" | jq -r --arg k "$key" '.[$k] // empty')"
    if [ -z "$value" ]; then
      continue
    fi
    if [ "$OVERWRITE_SECRETS" = false ] && echo "$vault_fields" | jq -e --arg k "$key" 'has($k)' >/dev/null; then
      continue
    fi
    patch="$(echo "$patch" | jq -c --arg k "$key" --arg v "$value" '. + {($k): $v}')"
  done

  echo "$patch"
}

run_aws_s3_sync() {
  local source_bucket="$1"
  local source_access_key="$2"
  local source_secret_key="$3"
  local source_endpoint="$4"
  local source_region="$5"
  local target_bucket="$6"
  local target_access_key="$7"
  local target_secret_key="$8"
  local target_endpoint="$9"
  local target_region="${10}"
  local dry_run_flag="${11}"

  if [ "$source_bucket" = "$target_bucket" ] && [ "$source_endpoint" = "$target_endpoint" ]; then
    echo "ERROR: Source and target bucket are identical (${source_bucket}) — refusing sync" >&2
    return 1
  fi

  local staging_dir
  staging_dir="$(mktemp -d)"
  chmod 700 "$staging_dir"

  echo "    staging via ${staging_dir}..."

  AWS_ACCESS_KEY_ID="$source_access_key" \
  AWS_SECRET_ACCESS_KEY="$source_secret_key" \
  AWS_DEFAULT_REGION="$source_region" \
    aws s3 sync "s3://${source_bucket}/" "${staging_dir}/" \
      --endpoint-url "$source_endpoint" \
      $dry_run_flag

  if [ "$CONFIRM" = false ]; then
    echo "    (dry-run: would upload staged objects to s3://${target_bucket}/)"
    rm -rf "$staging_dir"
    return 0
  fi

  AWS_ACCESS_KEY_ID="$target_access_key" \
  AWS_SECRET_ACCESS_KEY="$target_secret_key" \
  AWS_DEFAULT_REGION="$target_region" \
    aws s3 sync "${staging_dir}/" "s3://${target_bucket}/" \
      --endpoint-url "$target_endpoint"

  rm -rf "$staging_dir"
}

drop_trailing_shell_comment_args "$@"
set -- "${DROPPED_COMMENT_ARGS[@]}"

while [ $# -gt 0 ]; do
  case "$1" in
    --legacy-file)
      LEGACY_FILE="$2"
      shift 2
      ;;
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
    --seed-vault-secrets)
      SEED_VAULT_SECRETS=true
      shift
      ;;
    --overwrite-secrets)
      OVERWRITE_SECRETS=true
      shift
      ;;
    --confirm)
      CONFIRM=true
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

require_cmd aws "Install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
require_cmd jq "Install jq: https://jqlang.github.io/jq/"

if ! assert_vault_ready; then
  exit 1
fi

legacy_fields="$(read_legacy_fields)"
mapfile -t source_creds < <(extract_s3_creds "$legacy_fields" "" || true)
if [ "${#source_creds[@]}" -ne 5 ]; then
  echo "ERROR: legacy file missing required B2 S3 fields (B2_BUCKET, B2_S3_*)" >&2
  exit 1
fi

SOURCE_BUCKET="${source_creds[0]}"
SOURCE_ACCESS_KEY="${source_creds[1]}"
SOURCE_SECRET_KEY="${source_creds[2]}"
SOURCE_ENDPOINT="${source_creds[3]}"
SOURCE_REGION="${source_creds[4]}"

if [ "$CONFIRM" = true ]; then
  echo "==> Confirm mode — objects will be copied from legacy bucket to Vault targets"
else
  echo "==> Dry-run mode — pass --confirm to copy objects"
fi

echo "==> Source: s3://${SOURCE_BUCKET}/ (${SOURCE_ENDPOINT})"
echo ""

dry_run_flag=""
if [ "$CONFIRM" = false ]; then
  dry_run_flag="--dryrun"
fi

ANY_SUCCESS=false

for config in "${CONFIGS[@]}"; do
  secret_path="$(secret_path_for "$MOUNT_PATH" "$PROJECT" "$config")"

  if ! secret_exists "$secret_path"; then
    echo "==> ${PROJECT}/${config}: skipped (no secret at ${secret_path})"
    CONFIGS_SKIPPED=$((CONFIGS_SKIPPED + 1))
    continue
  fi

  vault_fields="$(read_secret_fields "$secret_path")"

  if [ "$SEED_VAULT_SECRETS" = true ]; then
    seed_patch="$(build_legacy_seed_patch "$legacy_fields" "$vault_fields")"
    seed_count="$(echo "$seed_patch" | jq 'length')"
    if [ "$seed_count" -gt 0 ]; then
      if [ "$CONFIRM" = true ]; then
        echo "==> ${PROJECT}/${config}: seeding ${seed_count} B2_* key(s) from legacy file"
        kv_patch_fields "$secret_path" "$seed_patch"
        vault_fields="$(read_secret_fields "$secret_path")"
      else
        echo "==> ${PROJECT}/${config}: would seed ${seed_count} B2_* key(s) from legacy file"
      fi
    fi
  fi

  mapfile -t target_creds < <(extract_s3_creds "$vault_fields" "" || true)
  if [ "${#target_creds[@]}" -ne 5 ]; then
    echo "==> ${PROJECT}/${config}: skipped (missing B2 S3 fields in Vault)"
    CONFIGS_SKIPPED=$((CONFIGS_SKIPPED + 1))
    continue
  fi

  TARGET_BUCKET="${target_creds[0]}"
  TARGET_ACCESS_KEY="${target_creds[1]}"
  TARGET_SECRET_KEY="${target_creds[2]}"
  TARGET_ENDPOINT="${target_creds[3]}"
  TARGET_REGION="${target_creds[4]}"

  echo "==> ${PROJECT}/${config}: sync s3://${SOURCE_BUCKET}/ -> s3://${TARGET_BUCKET}/"
  if run_aws_s3_sync \
    "$SOURCE_BUCKET" "$SOURCE_ACCESS_KEY" "$SOURCE_SECRET_KEY" "$SOURCE_ENDPOINT" "$SOURCE_REGION" \
    "$TARGET_BUCKET" "$TARGET_ACCESS_KEY" "$TARGET_SECRET_KEY" "$TARGET_ENDPOINT" "$TARGET_REGION" \
    "$dry_run_flag"; then
    CONFIGS_PROCESSED=$((CONFIGS_PROCESSED + 1))
    ANY_SUCCESS=true
  else
    CONFIGS_FAILED=$((CONFIGS_FAILED + 1))
  fi
  echo ""
done

echo "================================================================================"
if [ "$CONFIRM" = true ]; then
  echo "Sync complete"
else
  echo "Dry run complete — re-run with --confirm to copy objects"
fi
echo "================================================================================"
echo ""
echo "Configs processed: ${CONFIGS_PROCESSED}"
echo "Configs skipped:   ${CONFIGS_SKIPPED}"
echo "Configs failed:    ${CONFIGS_FAILED}"
echo ""

if [ "$ANY_SUCCESS" = false ]; then
  echo "ERROR: No configs were synced successfully." >&2
  exit 1
fi

if [ "$CONFIGS_FAILED" -gt 0 ]; then
  exit 1
fi
