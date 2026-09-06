#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
POLICY_FILE="${REPO_ROOT}/config/policies/dev-read.hcl"
POLICY_NAME="dev-read"
TOKEN_PERIOD="768h"
DISPLAY_NAME="local-dev"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Create a scoped read-only Vault token for local development (vault run).

Requires root token or a token with policy write + token create permissions.

Options:
  --period DURATION   Token TTL (default: 768h / 32 days)
  -h, --help          Show this help

After running:
  vault login <token>
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --period)
      TOKEN_PERIOD="$2"
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

DEV_TOKEN="$(echo "$TOKEN_JSON" | jq -r '.auth.client_token')"

echo ""
echo "================================================================================"
echo "Dev token created (read-only on secret/*)"
echo "================================================================================"
echo ""
echo "Log in with:"
echo "  vault login ${DEV_TOKEN}"
echo ""
echo "Then in any project:"
echo "  vault setup --project myapp --config dev"
echo "  vault run -- bun myserver.tsx"
