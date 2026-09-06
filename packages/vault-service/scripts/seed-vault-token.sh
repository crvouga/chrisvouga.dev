#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
POLICY_FILE="${REPO_ROOT}/config/policies/personal-read.hcl"
POLICY_NAME="personal-read"
TOKEN_PERIOD="768h"
DISPLAY_NAME="personal-runtime"
MOUNT_PATH="secret"
PROJECT="personal"
CONFIGS=(dev prd)

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"

TMPFILE=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Mint a read-only periodic token scoped to secret/personal/* and seed it as
VAULT_TOKEN in secret/personal/dev and secret/personal/prd.

Requires root token or a token with policy write + token create permissions.

Options:
  --period DURATION   Token TTL (default: 768h / 32 days)
  --mount PATH        KV v2 mount path (default: secret)
  --project NAME      Project namespace (default: personal)
  -h, --help          Show this help

Environment:
  VAULT_ADDR          Vault API address (default: https://vault.chrisvouga.dev)
  VAULT_TOKEN         Vault token with admin permissions (optional if resolved automatically)

After running, install VAULT_TOKEN into each app's platform secrets along with
VAULT_CONFIG (dev or prd) and optionally VAULT_ADDR / VAULT_PROJECT.
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

while [ $# -gt 0 ]; do
  case "$1" in
    --period)
      TOKEN_PERIOD="$2"
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

if [ ! -f "$POLICY_FILE" ]; then
  echo "ERROR: Policy file not found: ${POLICY_FILE}" >&2
  exit 1
fi

require_cmd jq "Install jq: https://jqlang.github.io/jq/"

if ! export_vault_auth; then
  exit 1
fi

if ! resolve_vault_bin; then
  echo "ERROR: Vault CLI binary not found." >&2
  exit 1
fi

trap cleanup EXIT

TMPFILE="$(mktemp)"
chmod 600 "$TMPFILE"

echo "==> Writing policy ${POLICY_NAME}..."
vault_cmd policy write "$POLICY_NAME" "$POLICY_FILE"

echo "==> Creating token (period=${TOKEN_PERIOD}, policy=${POLICY_NAME})..."
TOKEN_JSON="$(
  vault_cmd token create \
    -policy="$POLICY_NAME" \
    -period="$TOKEN_PERIOD" \
    -display-name="$DISPLAY_NAME" \
    -format=json
)"

RUNTIME_TOKEN="$(echo "$TOKEN_JSON" | jq -r '.auth.client_token')"

if [ -z "$RUNTIME_TOKEN" ] || [ "$RUNTIME_TOKEN" = "null" ]; then
  echo "ERROR: Failed to create runtime token" >&2
  exit 1
fi

jq -n --arg token "$RUNTIME_TOKEN" '{VAULT_TOKEN: $token}' > "$TMPFILE"

echo "==> Seeding VAULT_TOKEN into ${MOUNT_PATH}/${PROJECT}/..."
for config in "${CONFIGS[@]}"; do
  secret_path="${MOUNT_PATH}/${PROJECT}/${config}"

  if secret_exists "$secret_path"; then
    echo "    ${secret_path}: patching VAULT_TOKEN (existing fields preserved)"
    vault_cmd kv patch "$secret_path" @"$TMPFILE"
  else
    echo "    ${secret_path}: creating with VAULT_TOKEN"
    vault_cmd kv put "$secret_path" @"$TMPFILE"
  fi
done

echo ""
echo "================================================================================"
echo "Runtime VAULT_TOKEN seeded"
echo "================================================================================"
echo ""
echo "Paths updated:"
for config in "${CONFIGS[@]}"; do
  echo "  ${MOUNT_PATH}/${PROJECT}/${config}"
done
echo ""
echo "Token policy:  ${POLICY_NAME} (read-only on ${MOUNT_PATH}/personal/*)"
echo "Token period:  ${TOKEN_PERIOD}"
echo ""
echo "Apps using runtime secret fetch should also receive:"
echo "  VAULT_CONFIG=dev|prd"
echo "  VAULT_ADDR=${VAULT_ADDR:-$VAULT_DEFAULT_ADDR}"
echo "  VAULT_PROJECT=${PROJECT}  (optional)"
echo ""
echo "Re-running this script mints a new token and overwrites VAULT_TOKEN in both configs."
echo "The previous token is not automatically revoked."
