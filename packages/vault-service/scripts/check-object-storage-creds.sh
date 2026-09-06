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
JSON_OUTPUT=false
declare -a CONFIGS=("dev" "prd")

B2_PROBE_KEYS=(B2_BUCKET B2_S3_ACCESS_KEY_ID B2_S3_SECRET_ACCESS_KEY B2_S3_ENDPOINT B2_S3_REGION)
S3_PROBE_KEYS=(S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_ENDPOINT S3_REGION)

CHECKS_TOTAL=0
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_SKIPPED=0

declare -a RESULT_LINES=()

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Verify B2 and S3 object-storage credentials in Vault dev and prd configs.

For each credential set present, probes bucket access via AWS CLI against the
S3-compatible endpoint. Also checks S3 alias key consistency when alias keys exist.

Options:
  --mount PATH     KV v2 mount path (default: secret)
  --project NAME   Project namespace (default: personal)
  --config NAME    Config to check (repeatable; default: dev and prd)
  --json           Emit machine-readable JSON on stdout
  -h, --help       Show this help

Prerequisites:
  aws CLI, jq, curl, vault CLI

Examples:
  ./scripts/vault-run.sh -- ./scripts/check-object-storage-creds.sh
  ./scripts/check-object-storage-creds.sh --config dev --json
EOF
}

record_result() {
  local config="$1"
  local set_name="$2"
  local status="$3"
  local detail="$4"

  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  case "$status" in
    pass) CHECKS_PASSED=$((CHECKS_PASSED + 1)) ;;
    fail) CHECKS_FAILED=$((CHECKS_FAILED + 1)) ;;
    skip) CHECKS_SKIPPED=$((CHECKS_SKIPPED + 1)) ;;
  esac

  RESULT_LINES+=("$(jq -nc \
    --arg config "$config" \
    --arg set "$set_name" \
    --arg status "$status" \
    --arg detail "$detail" \
    '{config: $config, set: $set, status: $status, detail: $detail}')")
}

fields_have_all_keys() {
  local fields="$1"
  shift
  local key
  for key in "$@"; do
    local value
    value="$(echo "$fields" | jq -r --arg k "$key" '.[$k] // empty')"
    if [ -z "$value" ]; then
      return 1
    fi
  done
  return 0
}

extract_cred_set() {
  local fields="$1"
  local prefix="$2"
  local bucket_key access_key secret_key endpoint_key region_key

  case "$prefix" in
    B2)
      bucket_key="B2_BUCKET"
      access_key="B2_S3_ACCESS_KEY_ID"
      secret_key="B2_S3_SECRET_ACCESS_KEY"
      endpoint_key="B2_S3_ENDPOINT"
      region_key="B2_S3_REGION"
      ;;
    S3)
      bucket_key="S3_BUCKET"
      access_key="S3_ACCESS_KEY_ID"
      secret_key="S3_SECRET_ACCESS_KEY"
      endpoint_key="S3_ENDPOINT"
      region_key="S3_REGION"
      ;;
    *)
      return 1
      ;;
  esac

  printf '%s\n%s\n%s\n%s\n%s' \
    "$(echo "$fields" | jq -r --arg k "$bucket_key" '.[$k] // empty')" \
    "$(echo "$fields" | jq -r --arg k "$access_key" '.[$k] // empty')" \
    "$(echo "$fields" | jq -r --arg k "$secret_key" '.[$k] // empty')" \
    "$(echo "$fields" | jq -r --arg k "$endpoint_key" '.[$k] // empty')" \
    "$(echo "$fields" | jq -r --arg k "$region_key" '.[$k] // empty')"
}

probe_bucket() {
  local bucket="$1"
  local access_key="$2"
  local secret_key="$3"
  local endpoint="$4"
  local region="$5"

  if AWS_ACCESS_KEY_ID="$access_key" \
     AWS_SECRET_ACCESS_KEY="$secret_key" \
     AWS_DEFAULT_REGION="$region" \
       aws s3api head-bucket --bucket "$bucket" --endpoint-url "$endpoint" >/dev/null 2>&1; then
    return 0
  fi

  AWS_ACCESS_KEY_ID="$access_key" \
  AWS_SECRET_ACCESS_KEY="$secret_key" \
  AWS_DEFAULT_REGION="$region" \
    aws s3api list-objects-v2 --bucket "$bucket" --max-items 1 --endpoint-url "$endpoint" >/dev/null 2>&1
}

check_alias_consistency() {
  local fields="$1"
  local config="$2"
  local access_key_id access_key secret_access_key secret_key

  access_key_id="$(echo "$fields" | jq -r '.S3_ACCESS_KEY_ID // empty')"
  access_key="$(echo "$fields" | jq -r '.S3_ACCESS_KEY // empty')"
  secret_access_key="$(echo "$fields" | jq -r '.S3_SECRET_ACCESS_KEY // empty')"
  secret_key="$(echo "$fields" | jq -r '.S3_SECRET_KEY // empty')"

  if [ -n "$access_key" ] && [ -n "$access_key_id" ] && [ "$access_key" != "$access_key_id" ]; then
    record_result "$config" "s3-aliases" "fail" "S3_ACCESS_KEY != S3_ACCESS_KEY_ID"
    echo "  FAIL  ${config}/s3-aliases: S3_ACCESS_KEY != S3_ACCESS_KEY_ID"
    return 1
  fi

  if [ -n "$secret_key" ] && [ -n "$secret_access_key" ] && [ "$secret_key" != "$secret_access_key" ]; then
    record_result "$config" "s3-aliases" "fail" "S3_SECRET_KEY != S3_SECRET_ACCESS_KEY"
    echo "  FAIL  ${config}/s3-aliases: S3_SECRET_KEY != S3_SECRET_ACCESS_KEY"
    return 1
  fi

  if [ -n "$access_key" ] || [ -n "$secret_key" ]; then
    record_result "$config" "s3-aliases" "pass" "alias keys consistent"
    echo "  OK    ${config}/s3-aliases: alias keys consistent"
  fi

  return 0
}

check_cred_set() {
  local config="$1"
  local set_name="$2"
  local fields="$3"
  shift 3
  local -a required_keys=("$@")

  if ! fields_have_all_keys "$fields" "${required_keys[@]}"; then
    record_result "$config" "$set_name" "skip" "incomplete credential set"
    echo "  SKIP  ${config}/${set_name}: incomplete credential set"
    return 0
  fi

  local prefix
  prefix="$(printf '%s' "$set_name" | tr '[:lower:]' '[:upper:]')"
  mapfile -t creds < <(extract_cred_set "$fields" "$prefix")
  local bucket="${creds[0]}"
  local endpoint="${creds[3]}"

  if probe_bucket "${creds[@]}"; then
    record_result "$config" "$set_name" "pass" "bucket ${bucket} reachable at ${endpoint}"
    echo "  OK    ${config}/${set_name}: bucket ${bucket} reachable"
  else
    record_result "$config" "$set_name" "fail" "bucket ${bucket} probe failed at ${endpoint}"
    echo "  FAIL  ${config}/${set_name}: bucket ${bucket} probe failed"
    return 1
  fi
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

require_cmd aws "Install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"

if ! assert_vault_ready; then
  exit 1
fi

if [ "$JSON_OUTPUT" = false ]; then
  echo "==> Checking object storage credentials for ${PROJECT} (${CONFIGS[*]})"
  echo ""
fi

for config in "${CONFIGS[@]}"; do
  secret_path="$(secret_path_for "$MOUNT_PATH" "$PROJECT" "$config")"

  if ! secret_exists "$secret_path"; then
    record_result "$config" "vault" "fail" "no secret at ${secret_path}"
    if [ "$JSON_OUTPUT" = false ]; then
      echo "  FAIL  ${config}/vault: no secret at ${secret_path}"
    fi
    continue
  fi

  fields="$(read_secret_fields "$secret_path")"

  if [ "$JSON_OUTPUT" = false ]; then
    echo "-- ${config} --"
  fi

  check_cred_set "$config" "b2" "$fields" "${B2_PROBE_KEYS[@]}" || true
  check_cred_set "$config" "s3" "$fields" "${S3_PROBE_KEYS[@]}" || true
  check_alias_consistency "$fields" "$config" || true

  if [ "$JSON_OUTPUT" = false ]; then
    echo ""
  fi
done

if [ "$JSON_OUTPUT" = true ]; then
  jq -nc \
    --arg project "$PROJECT" \
    --arg mount "$MOUNT_PATH" \
    --argjson results "$(printf '%s\n' "${RESULT_LINES[@]}" | jq -s '.')" \
    --argjson passed "$CHECKS_PASSED" \
    --argjson failed "$CHECKS_FAILED" \
    --argjson skipped "$CHECKS_SKIPPED" \
    '{project: $project, mount: $mount, passed: $passed, failed: $failed, skipped: $skipped, results: $results}'
else
  echo "================================================================================"
  echo "Passed:  ${CHECKS_PASSED}"
  echo "Failed:  ${CHECKS_FAILED}"
  echo "Skipped: ${CHECKS_SKIPPED}"
  echo "================================================================================"
fi

if [ "$CHECKS_FAILED" -gt 0 ]; then
  exit 1
fi

if [ "$CHECKS_PASSED" -eq 0 ] && [ "$CHECKS_SKIPPED" -eq "$CHECKS_TOTAL" ]; then
  echo "ERROR: No credential sets were probed (all skipped)." >&2
  exit 1
fi
