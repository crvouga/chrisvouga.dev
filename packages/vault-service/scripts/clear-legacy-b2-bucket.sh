#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"
# shellcheck source=lib/vault-kv.sh
source "${SCRIPT_DIR}/lib/vault-kv.sh"

LEGACY_FILE="${REPO_ROOT}/legacy-b2.json"
USE_LEGACY_FILE=true
MOUNT_PATH="${VAULT_KV_DEFAULT_MOUNT}"
PROJECT="${VAULT_KV_DEFAULT_PROJECT}"
VAULT_CONFIG="prd"
BUCKET_OVERRIDE=""
CONFIRM=false
USE_S3_FIRST=true
PAGE_SIZE=1000

B2_AUTH_TOKEN=""
B2_API_URL=""
B2_ACCOUNT_ID=""
B2_BUCKET_ID=""
B2_BUCKET_NAME=""
B2_KEY_ID=""
B2_APP_KEY=""
B2_BUCKET_JSON="{}"

CREDS_JSON="{}"

FILES_LISTED=0
FILES_DELETED=0
FILES_UNLOCKED=0
FILES_FAILED=0
FILES_SKIPPED=0
FILES_COMPLIANCE_BLOCKED=0
COMPLIANCE_MAX_RETAIN_MS=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Empty a legacy Backblaze B2 bucket so it can be deleted.

Uses B2 master credentials from Vault by default:
  secret/<project>/prd → B2_MASTER_KEY_ID, B2_MASTER_KEY

Bucket to empty defaults to B2_BUCKET in legacy-b2.json when present, otherwise
Vault prd B2_BUCKET / S3_BUCKET. Override with --bucket NAME.

Falls back to legacy-b2.json for S3-compatible fields when Vault does not define
them. The native B2 API pass always uses the master key.

Default is dry-run. Pass --confirm to delete objects.

Options:
  --legacy-file PATH   Optional legacy JSON fallback (default: ./legacy-b2.json)
  --no-legacy-file     Do not read legacy-b2.json
  --mount PATH         KV v2 mount path (default: secret)
  --project NAME       Vault project (default: personal)
  --config NAME        Vault config for master key (default: prd)
  --bucket NAME        Bucket to empty (default: legacy B2_BUCKET, else Vault)
  --no-s3-first        Skip the initial aws s3 rm pass (native API only)
  --confirm            Delete objects (default is dry-run)
  -h, --help           Show this help

Prerequisites:
  jq, curl, vault CLI (for Vault master key lookup)
  Optional: aws cli for a fast unlocked-object pass (--no-s3-first to skip)

Examples:
  ./scripts/vault-run.sh -- ./scripts/clear-legacy-b2-bucket.sh
  ./scripts/vault-run.sh -- ./scripts/clear-legacy-b2-bucket.sh --confirm
  ./scripts/vault-run.sh -- ./scripts/clear-legacy-b2-bucket.sh --bucket crvouga --confirm
  ./scripts/clear-legacy-b2-bucket.sh --confirm --no-s3-first
EOF
}

load_legacy_fields_optional() {
  if [ "$USE_LEGACY_FILE" = false ] || [ ! -f "$LEGACY_FILE" ]; then
    echo '{}'
    return 0
  fi
  jq -c '.' "$LEGACY_FILE"
}

load_vault_fields() {
  local secret_path

  secret_path="$(secret_path_for "$MOUNT_PATH" "$PROJECT" "$VAULT_CONFIG")"
  if ! secret_exists "$secret_path"; then
    echo "ERROR: No secret at ${secret_path}" >&2
    exit 1
  fi
  read_secret_fields "$secret_path"
}

merge_credential_fields() {
  local legacy="$1"
  local vault="$2"
  jq -nc --argjson legacy "$legacy" --argjson vault "$vault" '$legacy * $vault'
}

require_credential_field() {
  local key="$1"
  local value

  value="$(echo "$CREDS_JSON" | jq -r --arg k "$key" '.[$k] // empty')"
  if [ -z "$value" ]; then
    echo "ERROR: ${key} missing — set it in Vault ${PROJECT}/${VAULT_CONFIG} or legacy-b2.json" >&2
    exit 1
  fi
  printf '%s' "$value"
}

resolve_bucket_name() {
  local legacy="$1"
  local vault="$2"

  if [ -n "$BUCKET_OVERRIDE" ]; then
    printf '%s' "$BUCKET_OVERRIDE"
    return 0
  fi

  local from_legacy from_vault
  from_legacy="$(echo "$legacy" | jq -r '.B2_BUCKET // empty')"
  from_vault="$(echo "$vault" | jq -r '.B2_BUCKET // .S3_BUCKET // empty')"

  if [ -n "$from_legacy" ] && [ "$USE_LEGACY_FILE" = true ]; then
    printf '%s' "$from_legacy"
    return 0
  fi

  if [ -n "$from_vault" ]; then
    printf '%s' "$from_vault"
    return 0
  fi

  return 1
}

resolve_credentials() {
  local legacy vault

  if ! assert_vault_ready; then
    exit 1
  fi

  legacy="$(load_legacy_fields_optional)"
  vault="$(load_vault_fields)"
  CREDS_JSON="$(merge_credential_fields "$legacy" "$vault")"

  B2_KEY_ID="$(require_credential_field "B2_MASTER_KEY_ID")"
  B2_APP_KEY="$(require_credential_field "B2_MASTER_KEY")"
  if ! B2_BUCKET_NAME="$(resolve_bucket_name "$legacy" "$vault")"; then
    echo "ERROR: bucket name missing — pass --bucket, or set B2_BUCKET in legacy-b2.json / Vault ${PROJECT}/${VAULT_CONFIG}" >&2
    exit 1
  fi
}

b2_post() {
  local endpoint="$1"
  local payload="$2"
  local response http_code body

  response="$(mktemp)"
  http_code="$(
    curl -sS -o "$response" -w '%{http_code}' -X POST "${endpoint}" \
      -H "Authorization: ${B2_AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$payload"
  )"
  body="$(cat "$response")"
  rm -f "$response"

  if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
    echo "ERROR: B2 API HTTP ${http_code}: ${body}" >&2
    return 1
  fi

  if echo "$body" | jq -e '.code' >/dev/null 2>&1; then
    echo "ERROR: B2 API: $(echo "$body" | jq -r '.message // .code')" >&2
    return 1
  fi

  printf '%s' "$body"
}

b2_authorize_and_bucket() {
  local key_id="$1"
  local app_key="$2"
  local bucket_name="$3"
  local auth_response buckets bucket_json basic

  basic="$(printf '%s:%s' "$key_id" "$app_key" | base64 | tr -d '\n')"
  auth_response="$(
    curl -sS -X GET 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account' \
      -H "Authorization: Basic ${basic}"
  )"

  if echo "$auth_response" | jq -e '.code' >/dev/null 2>&1; then
    echo "ERROR: b2_authorize_account failed: ${auth_response}" >&2
    exit 1
  fi

  B2_AUTH_TOKEN="$(echo "$auth_response" | jq -r '.authorizationToken')"
  B2_API_URL="$(echo "$auth_response" | jq -r '.apiUrl')"
  B2_ACCOUNT_ID="$(echo "$auth_response" | jq -r '.accountId')"
  B2_BUCKET_NAME="$bucket_name"

  buckets="$(
    b2_post "${B2_API_URL}/b2api/v2/b2_list_buckets" \
      "$(jq -nc --arg id "$B2_ACCOUNT_ID" '{accountId: $id, bucketTypes: ["allPrivate", "allPublic"]}')"
  )"

  bucket_json="$(echo "$buckets" | jq -c --arg name "$bucket_name" \
    '.buckets[] | select(.bucketName == $name)' | head -1)"
  if [ -z "$bucket_json" ] || [ "$bucket_json" = "null" ]; then
    echo "ERROR: Bucket not found: ${bucket_name}" >&2
    exit 1
  fi
  B2_BUCKET_JSON="$bucket_json"
  B2_BUCKET_ID="$(echo "$bucket_json" | jq -r '.bucketId')"
}

# Stop new uploads from inheriting compliance/governance default retention.
# Object Lock itself cannot be disabled once enabled; only the default can be cleared.
clear_bucket_default_retention() {
  local mode period_json payload

  mode="$(echo "$B2_BUCKET_JSON" | jq -r '
    .fileLockConfiguration.value.defaultRetention.mode
    // .fileLockConfiguration.defaultRetention.mode
    // empty
  ')"
  period_json="$(echo "$B2_BUCKET_JSON" | jq -c '
    .fileLockConfiguration.value.defaultRetention.period
    // .fileLockConfiguration.defaultRetention.period
    // null
  ')"

  if [ -z "$mode" ] || [ "$mode" = "null" ]; then
    echo "==> Bucket default retention already unset (Object Lock may still be enabled)"
    return 0
  fi

  echo "==> Bucket default retention is mode=${mode} period=${period_json}"
  if [ "$CONFIRM" = false ]; then
    echo "    would clear default retention so new uploads are not auto-locked"
    return 0
  fi

  payload="$(
    jq -nc \
      --arg accountId "$B2_ACCOUNT_ID" \
      --arg bucketId "$B2_BUCKET_ID" \
      '{
        accountId: $accountId,
        bucketId: $bucketId,
        defaultRetention: { mode: null, period: null }
      }'
  )"
  if b2_post "${B2_API_URL}/b2api/v2/b2_update_bucket" "$payload" >/dev/null; then
    echo "    cleared default retention (existing compliance objects remain locked)"
    B2_BUCKET_JSON="$(echo "$B2_BUCKET_JSON" | jq -c '
      .fileLockConfiguration.value.defaultRetention = {mode: null, period: null}
    ')"
  else
    echo "    WARN: could not clear default retention — new uploads may still auto-lock" >&2
  fi
}

try_s3_recursive_delete() {
  local bucket access_key secret_key endpoint region

  if [ "$USE_S3_FIRST" = false ]; then
    return 0
  fi
  if ! command -v aws >/dev/null 2>&1; then
    echo "==> Skipping S3 pre-pass (aws CLI not installed)"
    return 0
  fi

  bucket="$B2_BUCKET_NAME"
  if [ "$USE_LEGACY_FILE" = true ] && [ -f "$LEGACY_FILE" ]; then
    access_key="$(jq -r '.B2_S3_ACCESS_KEY_ID // empty' "$LEGACY_FILE")"
    secret_key="$(jq -r '.B2_S3_SECRET_ACCESS_KEY // empty' "$LEGACY_FILE")"
    endpoint="$(jq -r '.B2_S3_ENDPOINT // empty' "$LEGACY_FILE")"
    region="$(jq -r '.B2_S3_REGION // empty' "$LEGACY_FILE")"
  else
    access_key="$(echo "$CREDS_JSON" | jq -r '.B2_S3_ACCESS_KEY_ID // .S3_ACCESS_KEY_ID // empty')"
    secret_key="$(echo "$CREDS_JSON" | jq -r '.B2_S3_SECRET_ACCESS_KEY // .S3_SECRET_ACCESS_KEY // empty')"
    endpoint="$(echo "$CREDS_JSON" | jq -r '.B2_S3_ENDPOINT // .S3_ENDPOINT // empty')"
    region="$(echo "$CREDS_JSON" | jq -r '.B2_S3_REGION // .S3_REGION // empty')"
  fi

  if [ -z "$bucket" ] || [ -z "$access_key" ] || [ -z "$secret_key" ] || [ -z "$endpoint" ]; then
    echo "==> Skipping S3 pre-pass (missing S3-compatible fields)"
    return 0
  fi

  echo "==> S3 pre-pass on s3://${bucket}/ (unlocked objects only)"
  if [ "$CONFIRM" = true ]; then
    AWS_ACCESS_KEY_ID="$access_key" \
    AWS_SECRET_ACCESS_KEY="$secret_key" \
    AWS_DEFAULT_REGION="$region" \
      aws s3 rm "s3://${bucket}/" --recursive --endpoint-url "$endpoint" || true
  else
    AWS_ACCESS_KEY_ID="$access_key" \
    AWS_SECRET_ACCESS_KEY="$secret_key" \
    AWS_DEFAULT_REGION="$region" \
      aws s3 rm "s3://${bucket}/" --recursive --dryrun --endpoint-url "$endpoint" || true
  fi
}

# B2 list/get APIs nest Object Lock fields under .value when the client can read them.
file_legal_hold_value() {
  echo "$1" | jq -r '
    if (.legalHold | type) == "object" then (.legalHold.value // empty)
    else (.legalHold // empty) end
  '
}

file_retention_mode() {
  echo "$1" | jq -r '
    if (.fileRetention | type) == "object" then
      (.fileRetention.value.mode // .fileRetention.mode // empty)
    else empty end
  '
}

file_retention_until() {
  echo "$1" | jq -r '
    if (.fileRetention | type) == "object" then
      (.fileRetention.value.retainUntilTimestamp // .fileRetention.retainUntilTimestamp // 0)
    else 0 end
  '
}

format_retain_until() {
  local ms="$1"
  if [ -z "$ms" ] || [ "$ms" = "0" ] || [ "$ms" = "null" ]; then
    printf 'unknown'
    return 0
  fi
  python3 -c 'from datetime import datetime,timezone; import sys; print(datetime.fromtimestamp(int(sys.argv[1])/1000, tz=timezone.utc).isoformat())' "$ms" 2>/dev/null \
    || printf 'epoch_ms=%s' "$ms"
}

unlock_file_if_needed() {
  local file_json="$1"
  local file_id file_name legal_hold retention_mode retain_until payload

  file_id="$(echo "$file_json" | jq -r '.fileId')"
  file_name="$(echo "$file_json" | jq -r '.fileName')"
  legal_hold="$(file_legal_hold_value "$file_json")"
  retention_mode="$(file_retention_mode "$file_json")"
  retain_until="$(file_retention_until "$file_json")"

  if [ "$legal_hold" = "on" ]; then
    if [ "$CONFIRM" = true ]; then
      payload="$(jq -nc --arg id "$file_id" '{fileId: $id, legalHold: "off"}')"
      if b2_post "${B2_API_URL}/b2api/v2/b2_update_file_legal_hold" "$payload" >/dev/null; then
        FILES_UNLOCKED=$((FILES_UNLOCKED + 1))
        echo "    unlocked legal hold: ${file_name}"
      else
        echo "    WARN: could not clear legal hold: ${file_name}" >&2
      fi
    else
      echo "    would clear legal hold: ${file_name}"
      FILES_UNLOCKED=$((FILES_UNLOCKED + 1))
    fi
  fi

  if [ -z "$retention_mode" ] || [ "$retention_mode" = "null" ]; then
    return 0
  fi

  if [ "$retention_mode" = "compliance" ]; then
    # Reported as BLOCKED in delete_file_version — cannot be bypassed.
    return 0
  fi

  # governance mode can be cleared with bypassGovernance
  if [ "$CONFIRM" = true ]; then
    payload="$(
      jq -nc \
        --arg id "$file_id" \
        --arg name "$file_name" \
        '{fileId: $id, fileName: $name, bypassGovernance: true, fileRetention: {mode: null, retainUntilTimestamp: null}}'
    )"
    if b2_post "${B2_API_URL}/b2api/v2/b2_update_file_retention" "$payload" >/dev/null; then
      FILES_UNLOCKED=$((FILES_UNLOCKED + 1))
      echo "    cleared retention (${retention_mode}, was ${retain_until}): ${file_name}"
    else
      echo "    WARN: could not clear retention (${retention_mode}): ${file_name}" >&2
    fi
  else
    echo "    would clear retention (${retention_mode}): ${file_name}"
    FILES_UNLOCKED=$((FILES_UNLOCKED + 1))
  fi
}

delete_file_version() {
  local file_json="$1"
  local file_id file_name file_action payload response retention_mode retain_until

  file_id="$(echo "$file_json" | jq -r '.fileId')"
  file_name="$(echo "$file_json" | jq -r '.fileName')"
  file_action="$(echo "$file_json" | jq -r '.action // "upload"')"
  retention_mode="$(file_retention_mode "$file_json")"
  retain_until="$(file_retention_until "$file_json")"

  unlock_file_if_needed "$file_json"

  if [ "$retention_mode" = "compliance" ]; then
    FILES_COMPLIANCE_BLOCKED=$((FILES_COMPLIANCE_BLOCKED + 1))
    FILES_FAILED=$((FILES_FAILED + 1))
    if [ -n "$retain_until" ] && [ "$retain_until" != "0" ] && [ "$retain_until" != "null" ]; then
      if [ "$retain_until" -gt "$COMPLIANCE_MAX_RETAIN_MS" ] 2>/dev/null; then
        COMPLIANCE_MAX_RETAIN_MS="$retain_until"
      fi
    fi
    # Keep noise down: log the first few, then summarize at the end.
    if [ "$FILES_COMPLIANCE_BLOCKED" -le 5 ]; then
      echo "    BLOCKED compliance until $(format_retain_until "$retain_until"): ${file_name}" >&2
    elif [ "$FILES_COMPLIANCE_BLOCKED" -eq 6 ]; then
      echo "    BLOCKED compliance: … (further objects omitted; see summary)" >&2
    fi
    return 1
  fi

  if [ "$CONFIRM" = false ]; then
    echo "    would delete (${file_action}): ${file_name} (${file_id})"
    FILES_DELETED=$((FILES_DELETED + 1))
    return 0
  fi

  payload="$(jq -nc --arg id "$file_id" --arg name "$file_name" \
    '{fileId: $id, fileName: $name}')"
  if response="$(b2_post "${B2_API_URL}/b2api/v2/b2_delete_file_version" "$payload" 2>&1)"; then
    echo "    deleted (${file_action}): ${file_name}"
    FILES_DELETED=$((FILES_DELETED + 1))
    return 0
  fi

  if echo "$response" | grep -qi 'file_not_present\|already deleted'; then
    echo "    skip (already deleted): ${file_name} (${file_action})"
    FILES_SKIPPED=$((FILES_SKIPPED + 1))
    return 0
  fi

  echo "    FAIL (${file_action}): ${file_name}: ${response}" >&2
  FILES_FAILED=$((FILES_FAILED + 1))
  return 1
}

clear_bucket_native() {
  local start_name="" start_id=""
  local page response files file next_name next_id

  echo "==> Native B2 pass on bucket ${B2_BUCKET_NAME} (${B2_BUCKET_ID}) using master key"

  while true; do
    page="$(
      jq -nc \
        --arg bucketId "$B2_BUCKET_ID" \
        --argjson max "$PAGE_SIZE" \
        --arg startFileName "$start_name" \
        --arg startFileId "$start_id" \
        '{
          bucketId: $bucketId,
          maxFileCount: $max
        }
        + (if ($startFileName | length) > 0 then {startFileName: $startFileName, startFileId: $startFileId} else {} end)'
    )"

    response="$(b2_post "${B2_API_URL}/b2api/v2/b2_list_file_versions" "$page")"
    mapfile -t files < <(echo "$response" | jq -c '.files[]?')

    if [ "${#files[@]}" -eq 0 ]; then
      break
    fi

    for file in "${files[@]}"; do
      FILES_LISTED=$((FILES_LISTED + 1))
      delete_file_version "$file" || true
    done

    next_name="$(echo "$response" | jq -r '.nextFileName // empty')"
    next_id="$(echo "$response" | jq -r '.nextFileId // empty')"
    if [ -z "$next_name" ] || [ -z "$next_id" ]; then
      break
    fi
    start_name="$next_name"
    start_id="$next_id"
  done
}

drop_trailing_shell_comment_args "$@"
set -- "${DROPPED_COMMENT_ARGS[@]}"

while [ $# -gt 0 ]; do
  case "$1" in
    --legacy-file)
      LEGACY_FILE="$2"
      USE_LEGACY_FILE=true
      shift 2
      ;;
    --no-legacy-file)
      USE_LEGACY_FILE=false
      shift
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
      VAULT_CONFIG="$2"
      shift 2
      ;;
    --bucket)
      BUCKET_OVERRIDE="$2"
      shift 2
      ;;
    --no-s3-first)
      USE_S3_FIRST=false
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

require_cmd jq "Install jq: https://jqlang.github.io/jq/"
require_cmd curl "Install curl"

resolve_credentials

if [ "$CONFIRM" = true ]; then
  echo "==> CONFIRM mode — deleting all objects from B2 bucket ${B2_BUCKET_NAME}"
else
  echo "==> Dry-run mode — pass --confirm to delete objects"
fi
echo "    master key: $(echo "$CREDS_JSON" | jq -r '.B2_MASTER_KEY_NAME // "from Vault prd"')"
echo "    vault path: ${MOUNT_PATH}/${PROJECT}/${VAULT_CONFIG}"
echo ""

b2_authorize_and_bucket "$B2_KEY_ID" "$B2_APP_KEY" "$B2_BUCKET_NAME"
clear_bucket_default_retention
try_s3_recursive_delete
b2_authorize_and_bucket "$B2_KEY_ID" "$B2_APP_KEY" "$B2_BUCKET_NAME"
clear_bucket_native

echo ""
echo "================================================================================"
if [ "$CONFIRM" = true ]; then
  echo "Bucket clear complete"
else
  echo "Dry run complete — re-run with --confirm to delete"
fi
echo "================================================================================"
echo "Bucket:           ${B2_BUCKET_NAME}"
echo "Versions listed:  ${FILES_LISTED}"
echo "Unlock actions:   ${FILES_UNLOCKED}"
echo "Delete actions:   ${FILES_DELETED}"
echo "Skipped:          ${FILES_SKIPPED}"
echo "Failed deletes:   ${FILES_FAILED}"
echo "Compliance locked:${FILES_COMPLIANCE_BLOCKED}"
echo ""

if [ "$FILES_COMPLIANCE_BLOCKED" -gt 0 ]; then
  echo "ERROR: ${FILES_COMPLIANCE_BLOCKED} file version(s) are locked in compliance mode." >&2
  echo "Backblaze cannot bypass compliance Object Lock (including support)." >&2
  echo "Earliest these objects can be deleted: $(format_retain_until "$COMPLIANCE_MAX_RETAIN_MS")" >&2
  echo "Until then: leave this bucket, or create a new bucket without default retention." >&2
  exit 1
fi

if [ "$FILES_FAILED" -gt 0 ]; then
  echo "ERROR: ${FILES_FAILED} file version(s) could not be deleted." >&2
  exit 1
fi

echo "When the bucket is empty, delete it from the Backblaze console or with the B2 CLI:"
echo "  b2 delete-bucket ${B2_BUCKET_NAME}"
echo ""
