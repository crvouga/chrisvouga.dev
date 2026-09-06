#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SECRET_PATH="smoke-test/ping"
MOUNT_PATH="smoke-test"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"

require_cmd jq "Install jq: https://jqlang.github.io/jq/"

if ! export_vault_auth; then
  exit 1
fi

if ! resolve_vault_bin; then
  echo "ERROR: vault CLI is required (https://openbao.org/docs/install/)" >&2
  exit 1
fi

echo "==> Checking health at ${VAULT_ADDR}/v1/sys/health..."
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${VAULT_ADDR}/v1/sys/health")"
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Expected HTTP 200 from health check, got ${HTTP_CODE}" >&2
  echo "OpenBao may be sealed or uninitialized. Unseal before running smoke tests." >&2
  exit 1
fi
echo "Health check passed (HTTP 200)."

echo "==> Verifying authentication..."
if ! vault_cmd token lookup >/dev/null 2>&1; then
  echo "ERROR: VAULT_TOKEN is invalid or expired" >&2
  exit 1
fi

echo "==> Ensuring KV v2 engine at ${MOUNT_PATH}/..."
if ! vault_cmd secrets list -format=json | jq -e --arg path "${MOUNT_PATH}/" 'has($path)' >/dev/null; then
  vault_cmd secrets enable -path="${MOUNT_PATH}" kv-v2
else
  echo "KV v2 already enabled at ${MOUNT_PATH}/"
fi

echo "==> Writing test secret..."
vault_cmd kv put "${SECRET_PATH}" value=pong

echo "==> Reading test secret back..."
VALUE="$(vault_cmd kv get -field=value "${SECRET_PATH}")"
if [ "$VALUE" != "pong" ]; then
  echo "ERROR: Expected value 'pong', got '${VALUE}'" >&2
  exit 1
fi

echo "==> Deleting test secret..."
if vault_cmd kv metadata get "${SECRET_PATH}" >/dev/null 2>&1; then
  vault_cmd kv metadata delete "${SECRET_PATH}"
else
  echo "Test secret already absent — skip delete"
fi

echo "✓ smoke test passed"
