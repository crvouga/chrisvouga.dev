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
VAULT_CONFIG="prd"
BUCKET_NAME=""
CONFIRM=false
PAGE_SIZE=100

B2_AUTH_TOKEN=""
B2_API_URL=""
B2_ACCOUNT_ID=""
B2_BUCKET_ID=""
B2_BUCKET_JSON="{}"
B2_KEY_ID=""
B2_APP_KEY=""

CREDS_JSON="{}"

LARGE_FILES_LISTED=0
LARGE_FILES_CANCELLED=0
LARGE_FILES_FAILED=0

usage() {
  cat <<EOF
Usage: $(basename "$0") --bucket NAME [OPTIONS]

Empty and permanently delete a Backblaze B2 bucket, including Object Lock cleanup.

Uses B2 master credentials from Vault:
  secret/<project>/<config> → B2_MASTER_KEY_ID, B2_MASTER_KEY

Steps:
  1. Empty the bucket via clear-legacy-b2-bucket.sh (unlocks Object Lock / legal hold)
  2. Cancel unfinished large files (blocks bucket deletion otherwise)
  3. Verify the bucket is empty
  4. Delete the bucket with b2_delete_bucket

Default is dry-run. Pass --confirm to delete.

Options:
  --bucket NAME        Bucket to delete (required)
  --mount PATH         KV v2 mount path (default: secret)
  --project NAME       Vault project (default: personal)
  --config NAME        Vault config for master key (default: prd)
  --confirm            Apply deletes (default is dry-run)
  -h, --help           Show this help

Prerequisites:
  jq, curl, vault CLI (for Vault master key lookup)

Examples:
  ./scripts/vault-run.sh -- ./scripts/delete-b2-bucket.sh --bucket crvouga
  ./scripts/vault-run.sh -- ./scripts/delete-b2-bucket.sh --bucket crvouga --confirm
EOF
}

require_credential_field() {
  local key="$1"
  local value

  value="$(echo "$CREDS_JSON" | jq -r --arg k "$key" '.[$k] // empty')"
  if [ -z "$value" ]; then
    echo "ERROR: ${key} missing — set it in Vault ${PROJECT}/${VAULT_CONFIG}" >&2
    exit 1
  fi
  printf '%s' "$value"
}

resolve_credentials() {
  local secret_path

  if ! assert_vault_ready; then
    exit 1
  fi

  secret_path="$(secret_path_for "$MOUNT_PATH" "$PROJECT" "$VAULT_CONFIG")"
  if ! secret_exists "$secret_path"; then
    echo "ERROR: No secret at ${secret_path}" >&2
    exit 1
  fi
  CREDS_JSON="$(read_secret_fields "$secret_path")"
  B2_KEY_ID="$(require_credential_field "B2_MASTER_KEY_ID")"
  B2_APP_KEY="$(require_credential_field "B2_MASTER_KEY")"
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
  local auth_response buckets bucket_json basic

  basic="$(printf '%s:%s' "$B2_KEY_ID" "$B2_APP_KEY" | base64 | tr -d '\n')"
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

  buckets="$(
    b2_post "${B2_API_URL}/b2api/v2/b2_list_buckets" \
      "$(jq -nc --arg id "$B2_ACCOUNT_ID" '{accountId: $id, bucketTypes: ["allPrivate", "allPublic"]}')"
  )"

  bucket_json="$(echo "$buckets" | jq -c --arg name "$BUCKET_NAME" \
    '.buckets[] | select(.bucketName == $name)' | head -1)"
  if [ -z "$bucket_json" ] || [ "$bucket_json" = "null" ]; then
    echo "ERROR: Bucket not found: ${BUCKET_NAME}" >&2
    exit 1
  fi
  B2_BUCKET_JSON="$bucket_json"
  B2_BUCKET_ID="$(echo "$bucket_json" | jq -r '.bucketId')"
}

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
    echo "==> Bucket default retention already unset"
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
  else
    echo "    WARN: could not clear default retention" >&2
  fi
}

empty_bucket() {
  local clear_args=(
    --bucket "$BUCKET_NAME"
    --no-legacy-file
    --mount "$MOUNT_PATH"
    --project "$PROJECT"
    --config "$VAULT_CONFIG"
    --no-s3-first
  )

  if [ "$CONFIRM" = true ]; then
    clear_args+=(--confirm)
  fi

  echo "==> Step 1: emptying bucket via clear-legacy-b2-bucket.sh"
  if [ "$CONFIRM" = true ]; then
    if ! "${SCRIPT_DIR}/clear-legacy-b2-bucket.sh" "${clear_args[@]}"; then
      echo "==> Clear incomplete (likely compliance Object Lock) — continuing verify path" >&2
    fi
  else
    # Dry-run may exit non-zero when compliance locks would block deletes; still show later steps.
    "${SCRIPT_DIR}/clear-legacy-b2-bucket.sh" "${clear_args[@]}" || true
  fi
}

cancel_unfinished_large_files() {
  local start_id="" response files file file_id file_name next_id payload

  echo ""
  echo "==> Step 2: cancelling unfinished large files on ${BUCKET_NAME} (${B2_BUCKET_ID})"

  while true; do
    payload="$(
      jq -nc \
        --arg bucketId "$B2_BUCKET_ID" \
        --argjson max "$PAGE_SIZE" \
        --arg startFileId "$start_id" \
        '{
          bucketId: $bucketId,
          maxFileCount: $max
        }
        + (if ($startFileId | length) > 0 then {startFileId: $startFileId} else {} end)'
    )"

    response="$(b2_post "${B2_API_URL}/b2api/v2/b2_list_unfinished_large_files" "$payload")"
    mapfile -t files < <(echo "$response" | jq -c '.files[]?')

    if [ "${#files[@]}" -eq 0 ]; then
      break
    fi

    for file in "${files[@]}"; do
      LARGE_FILES_LISTED=$((LARGE_FILES_LISTED + 1))
      file_id="$(echo "$file" | jq -r '.fileId')"
      file_name="$(echo "$file" | jq -r '.fileName')"

      if [ "$CONFIRM" = false ]; then
        echo "    would cancel unfinished large file: ${file_name} (${file_id})"
        LARGE_FILES_CANCELLED=$((LARGE_FILES_CANCELLED + 1))
        continue
      fi

      if b2_post "${B2_API_URL}/b2api/v2/b2_cancel_large_file" \
        "$(jq -nc --arg id "$file_id" '{fileId: $id}')" >/dev/null; then
        echo "    cancelled unfinished large file: ${file_name}"
        LARGE_FILES_CANCELLED=$((LARGE_FILES_CANCELLED + 1))
      else
        echo "    FAIL cancelling unfinished large file: ${file_name}" >&2
        LARGE_FILES_FAILED=$((LARGE_FILES_FAILED + 1))
      fi
    done

    next_id="$(echo "$response" | jq -r '.nextFileId // empty')"
    if [ -z "$next_id" ]; then
      break
    fi
    start_id="$next_id"
  done

  if [ "$LARGE_FILES_LISTED" -eq 0 ]; then
    echo "    no unfinished large files"
  fi
}

verify_bucket_empty() {
  local response remaining locked_json count locked_count

  echo ""
  echo "==> Step 3: verifying bucket is empty"

  if [ "$CONFIRM" = false ]; then
    echo "    skip empty check in dry-run (objects were not deleted)"
    return 0
  fi

  response="$(
    b2_post "${B2_API_URL}/b2api/v2/b2_list_file_versions" \
      "$(jq -nc --arg bucketId "$B2_BUCKET_ID" '{bucketId: $bucketId, maxFileCount: 1000}')"
  )"

  count="$(echo "$response" | jq '.files | length')"
  if [ "$count" -eq 0 ]; then
    echo "    bucket is empty"
    return 0
  fi

  locked_json="$(
    echo "$response" | jq -c '
      [.files[]
        | . as $f
        | (($f.fileRetention.value.mode // $f.fileRetention.mode // "") ) as $mode
        | select($mode == "compliance")
        | {
            fileName,
            fileId,
            mode: $mode,
            retainUntilTimestamp: ($f.fileRetention.value.retainUntilTimestamp // $f.fileRetention.retainUntilTimestamp // 0)
          }
      ]'
  )"
  locked_count="$(echo "$locked_json" | jq 'length')"

  echo "ERROR: Bucket still has ${count} file version(s); cannot delete yet." >&2

  if [ "$locked_count" -gt 0 ]; then
    echo "" >&2
    echo "${locked_count} compliance-locked object(s) (showing up to 5):" >&2
    echo "$locked_json" | python3 -c '
import json,sys
from datetime import datetime,timezone
rows=json.load(sys.stdin)
latest=0
for i,o in enumerate(rows):
    ms=int(o.get("retainUntilTimestamp") or 0)
    if ms>latest: latest=ms
    if i>=5: continue
    when=datetime.fromtimestamp(ms/1000, tz=timezone.utc).isoformat() if ms else "unknown"
    print("  - %s until %s" % (o.get("fileName"), when))
if len(rows)>5:
    print("  - … and %d more" % (len(rows)-5))
print("")
if latest:
    print("Earliest bucket delete possible after: %s" % datetime.fromtimestamp(latest/1000, tz=timezone.utc).isoformat())
' >&2
    echo "" >&2
    echo "Backblaze cannot bypass compliance Object Lock (including support)." >&2
    echo "Default retention is already clear for new uploads; create a replacement bucket if you need one now." >&2
  else
    remaining="$(
      echo "$response" | jq -r '
        .files[]
        | . as $f
        | ($f.fileRetention.value.mode // $f.fileRetention.mode // "none") as $mode
        | ($f.fileRetention.value.retainUntilTimestamp // $f.fileRetention.retainUntilTimestamp // 0) as $until
        | "  - \(.fileName) (\(.fileId)) retention=\($mode) retainUntil=\($until)"
      '
    )"
    echo "$remaining" >&2
  fi
  return 1
}

delete_bucket() {
  echo ""
  echo "==> Step 4: deleting bucket ${BUCKET_NAME} (${B2_BUCKET_ID})"

  if [ "$CONFIRM" = false ]; then
    echo "    would call b2_delete_bucket for ${BUCKET_NAME}"
    return 0
  fi

  b2_post "${B2_API_URL}/b2api/v2/b2_delete_bucket" \
    "$(jq -nc --arg accountId "$B2_ACCOUNT_ID" --arg bucketId "$B2_BUCKET_ID" \
      '{accountId: $accountId, bucketId: $bucketId}')" >/dev/null
  echo "    deleted bucket ${BUCKET_NAME}"
}

verify_bucket_gone() {
  local buckets match

  if [ "$CONFIRM" = false ]; then
    return 0
  fi

  echo ""
  echo "==> Verifying bucket no longer exists"
  buckets="$(
    b2_post "${B2_API_URL}/b2api/v2/b2_list_buckets" \
      "$(jq -nc --arg id "$B2_ACCOUNT_ID" '{accountId: $id, bucketTypes: ["allPrivate", "allPublic"]}')"
  )"
  match="$(echo "$buckets" | jq -r --arg name "$BUCKET_NAME" \
    '.buckets[] | select(.bucketName == $name) | .bucketId' | head -1)"
  if [ -n "$match" ]; then
    echo "ERROR: Bucket ${BUCKET_NAME} still exists (id ${match})" >&2
    echo "If a snapshot is blocking deletion, remove it from the Backblaze Snapshots page and re-run." >&2
    exit 1
  fi
  echo "    confirmed: ${BUCKET_NAME} is gone"
}

drop_trailing_shell_comment_args "$@"
set -- "${DROPPED_COMMENT_ARGS[@]}"

while [ $# -gt 0 ]; do
  case "$1" in
    --bucket)
      BUCKET_NAME="$2"
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
      VAULT_CONFIG="$2"
      shift 2
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

if [ -z "$BUCKET_NAME" ]; then
  echo "ERROR: --bucket NAME is required" >&2
  usage >&2
  exit 1
fi

require_cmd jq "Install jq: https://jqlang.github.io/jq/"
require_cmd curl "Install curl"
chmod +x "${SCRIPT_DIR}/clear-legacy-b2-bucket.sh" "${SCRIPT_DIR}/delete-b2-bucket.sh" 2>/dev/null || true

resolve_credentials

if [ "$CONFIRM" = true ]; then
  echo "==> CONFIRM mode — will permanently delete B2 bucket ${BUCKET_NAME}"
else
  echo "==> Dry-run mode — pass --confirm to delete"
fi
echo "    vault path: ${MOUNT_PATH}/${PROJECT}/${VAULT_CONFIG}"
echo ""

b2_authorize_and_bucket
clear_bucket_default_retention

empty_bucket

# Re-authorize after the clear script (token may have expired / subprocess used its own).
b2_authorize_and_bucket
cancel_unfinished_large_files

if [ "$LARGE_FILES_FAILED" -gt 0 ]; then
  echo "ERROR: failed to cancel ${LARGE_FILES_FAILED} unfinished large file(s)" >&2
  exit 1
fi

# Re-auth again before verify/delete in case cancel took a while.
b2_authorize_and_bucket
verify_bucket_empty
delete_bucket
verify_bucket_gone

echo ""
echo "================================================================================"
if [ "$CONFIRM" = true ]; then
  echo "Bucket delete complete"
else
  echo "Dry run complete — re-run with --confirm to delete"
fi
echo "================================================================================"
echo "Bucket:                    ${BUCKET_NAME}"
echo "Unfinished large listed:   ${LARGE_FILES_LISTED}"
echo "Unfinished large cancelled:${LARGE_FILES_CANCELLED}"
echo "Unfinished large failed:   ${LARGE_FILES_FAILED}"
echo ""
