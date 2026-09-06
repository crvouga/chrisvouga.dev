#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"

AUTH_PATH="userpass"
POLICY_NAME="admin"
POLICY_FILE="${REPO_ROOT}/config/policies/admin.hcl"
USERNAME="crvouga"
TOKEN_PERIOD="768h"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Enable userpass auth and create a root-equivalent admin user for local login.
Re-running with the same username overwrites the existing user (password + policy).

The user receives the ${POLICY_NAME} policy (full read/write on all paths).
Password is read from ADMIN_PASSWORD or prompted interactively (never echoed).

Options:
  --username NAME   Userpass username (default: ${USERNAME})
  --period DURATION Token period after login (default: ${TOKEN_PERIOD})
  --policy NAME     Policy to attach (default: ${POLICY_NAME})
  --policy-file PATH Policy HCL file (default: config/policies/admin.hcl)
  --auth-path PATH  Auth mount path (default: ${AUTH_PATH})
  -h, --help        Show this help

Environment:
  VAULT_ADDR        Vault API address (default: https://vault.chrisvouga.dev)
  VAULT_TOKEN       Admin token (root or with auth/policy write). Resolved
                    automatically from login session, ~/.vault-token, or
                    init-output.json if unset.
  ADMIN_PASSWORD    Password for the user (optional; prompts if unset)

Examples:
  ./scripts/setup-userpass-admin.sh
  ./scripts/setup-userpass-admin.sh --username crvouga
  ADMIN_PASSWORD='...' ./scripts/setup-userpass-admin.sh
EOF
}

read_admin_password() {
  if [ -n "${ADMIN_PASSWORD:-}" ]; then
    return 0
  fi

  local password confirm
  if [ ! -t 0 ]; then
    echo "ERROR: ADMIN_PASSWORD is required when stdin is not a TTY." >&2
    exit 1
  fi

  read -r -s -p "Password for ${USERNAME}: " password
  echo ""
  read -r -s -p "Confirm password: " confirm
  echo ""

  if [ -z "$password" ]; then
    echo "ERROR: Password cannot be empty." >&2
    exit 1
  fi

  if [ "$password" != "$confirm" ]; then
    echo "ERROR: Passwords do not match." >&2
    exit 1
  fi

  ADMIN_PASSWORD="$password"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --username)
      [ $# -ge 2 ] || { echo "ERROR: --username requires a value" >&2; exit 1; }
      USERNAME="$2"
      shift 2
      ;;
    --period)
      [ $# -ge 2 ] || { echo "ERROR: --period requires a value" >&2; exit 1; }
      TOKEN_PERIOD="$2"
      shift 2
      ;;
    --policy)
      [ $# -ge 2 ] || { echo "ERROR: --policy requires a value" >&2; exit 1; }
      POLICY_NAME="$2"
      shift 2
      ;;
    --policy-file)
      [ $# -ge 2 ] || { echo "ERROR: --policy-file requires a value" >&2; exit 1; }
      POLICY_FILE="$2"
      shift 2
      ;;
    --auth-path)
      [ $# -ge 2 ] || { echo "ERROR: --auth-path requires a value" >&2; exit 1; }
      AUTH_PATH="${2#/}"
      AUTH_PATH="${AUTH_PATH%/}"
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
  echo "ERROR: vault CLI is required (https://openbao.org/docs/install/)" >&2
  exit 1
fi

echo "==> Verifying admin authentication..."
if ! vault_cmd token lookup >/dev/null 2>&1; then
  echo "ERROR: VAULT_TOKEN is invalid or expired (need root or auth/policy write)" >&2
  exit 1
fi

echo "==> Ensuring userpass auth method at ${AUTH_PATH}/..."
if ! vault_cmd auth list -format=json | jq -e --arg p "${AUTH_PATH}/" 'has($p)' >/dev/null; then
  vault_cmd auth enable -path="${AUTH_PATH}" userpass
else
  echo "Userpass auth already enabled at ${AUTH_PATH}/"
fi

echo "==> Writing policy ${POLICY_NAME}..."
vault_cmd policy write "${POLICY_NAME}" "${POLICY_FILE}"

read_admin_password

USER_FILE="$(mktemp)"
chmod 600 "$USER_FILE"
trap 'rm -f "$USER_FILE"' EXIT

USER_PAYLOAD="$(jq -nc \
  --arg password "$ADMIN_PASSWORD" \
  --arg policy "$POLICY_NAME" \
  --arg period "$TOKEN_PERIOD" \
  '{
     password: $password,
     token_policies: $policy,
     token_period: $period,
     token_no_default_policy: true
   }')"

printf '%s' "$USER_PAYLOAD" > "$USER_FILE"
unset ADMIN_PASSWORD

echo "==> Creating or updating userpass user ${USERNAME} (overwrites if exists)..."
vault_cmd write "auth/${AUTH_PATH}/users/${USERNAME}" @"$USER_FILE"

echo ""
echo "================================================================================"
echo "Userpass admin configured"
echo "================================================================================"
echo ""
echo "Auth mount:  ${AUTH_PATH}/"
echo "Username:    ${USERNAME}"
echo "Policy:      ${POLICY_NAME}"
echo "Token period:${TOKEN_PERIOD}"
echo ""
echo "Log in from any machine:"
echo ""
echo "  export VAULT_ADDR=${VAULT_ADDR}"
echo "  vault login -method=userpass username=${USERNAME}"
echo ""
echo "Then in any project:"
echo "  vault setup --project personal --config dev"
echo "  vault run -- <command>"
