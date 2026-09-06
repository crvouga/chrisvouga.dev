#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-https://vault.chrisvouga.dev}"
INIT_OUTPUT="${INIT_OUTPUT:-init-output.json}"
KEY_SHARES=5
KEY_THRESHOLD=3

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"

if [ -z "${DB_CONNECTION_URI:-}" ]; then
  echo "ERROR: DB_CONNECTION_URI is required" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is required (install PostgreSQL client)" >&2
  exit 1
fi

if ! resolve_vault_bin; then
  echo "ERROR: vault CLI is required (https://openbao.org/docs/install/)" >&2
  exit 1
fi

export VAULT_ADDR

# OpenBao returns 503 on /sys/health when sealed; treat sealed/uninit as reachable.
HEALTH_URL="${VAULT_ADDR}/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200"

echo "==> Running database migrations..."
"${SCRIPT_DIR}/migrate.sh"

echo "==> Waiting for OpenBao to become reachable at ${VAULT_ADDR}..."
for i in $(seq 1 60); do
  if curl -sf "${HEALTH_URL}" >/dev/null 2>&1; then
    echo "OpenBao is reachable."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: OpenBao did not become reachable within 5 minutes" >&2
    exit 1
  fi
  sleep 5
done

echo "==> Checking initialization status..."
INIT_STATUS="$(curl -sf "${VAULT_ADDR}/v1/sys/init")"
if echo "$INIT_STATUS" | jq -e '.initialized == true' >/dev/null; then
  echo "OpenBao is already initialized. Skipping init."
  echo "If sealed, unseal manually with: vault operator unseal"
  exit 0
fi

echo "==> Initializing OpenBao (${KEY_SHARES} key shares, threshold ${KEY_THRESHOLD})..."
INIT_JSON="$(
  VAULT_ADDR="$VAULT_ADDR" "$VAULT_REAL_BIN" operator init \
    -key-shares="${KEY_SHARES}" -key-threshold="${KEY_THRESHOLD}" -format=json
)"

printf '%s\n' "$INIT_JSON" > "$INIT_OUTPUT"
chmod 600 "$INIT_OUTPUT"

echo ""
echo "================================================================================"
echo "WARNING: SAVE THESE CREDENTIALS OFFLINE IMMEDIATELY"
echo "WARNING: Losing unseal keys or root token means losing ALL secrets permanently"
echo "================================================================================"
echo ""
echo "Init output saved to: ${INIT_OUTPUT}"
echo ""
echo "Unseal keys:"
printf '%s\n' "$INIT_JSON" | jq -r '.unseal_keys_b64[]' | nl -v 1 -w 2 -s '. '
echo ""
echo "Root token:"
printf '%s\n' "$INIT_JSON" | jq -r '.root_token'
echo ""
echo "================================================================================"

echo "==> Unsealing OpenBao with ${KEY_THRESHOLD} of ${KEY_SHARES} keys..."
for i in $(seq 1 "$KEY_THRESHOLD"); do
  KEY="$(printf '%s\n' "$INIT_JSON" | jq -r ".unseal_keys_b64[$((i - 1))]")"
  VAULT_ADDR="$VAULT_ADDR" "$VAULT_REAL_BIN" operator unseal "$KEY"
done

echo ""
echo "==> OpenBao is initialized and unsealed."
echo ""
echo "Root token (save this securely):"
printf '%s\n' "$INIT_JSON" | jq -r '.root_token'
echo ""
echo "Next steps:"
echo "  1. Store unseal keys and root token in a password manager or offline backup"
echo "  2. Add VAULT_TOKEN to GitHub repository secrets for CI smoke tests"
echo "  3. Run: vault login <root-token>  or  ./scripts/vault-run.sh -- ./scripts/smoke-test.sh"
