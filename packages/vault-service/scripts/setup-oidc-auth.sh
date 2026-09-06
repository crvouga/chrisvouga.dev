#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"

AUTH_PATH="jwt"
ROLE_NAME="github-actions"
POLICY_NAME="ci-read"
POLICY_FILE="${REPO_ROOT}/config/policies/ci-read.hcl"
OIDC_ISSUER="https://token.actions.githubusercontent.com"
TOKEN_TTL="15m"
TOKEN_MAX_TTL="30m"
AUDIENCE=""
REF="*"
declare -a REPOS=()

usage() {
  cat <<EOF
Usage: $(basename "$0") --repo OWNER/REPO [OPTIONS]

Configure GitHub Actions OIDC auth on OpenBao so CI can read secrets with a
short-lived token and no stored VAULT_TOKEN.

This enables the JWT auth method (verifying GitHub's OIDC issuer), writes the
${POLICY_NAME} policy, and creates a role bound to the given repo(s).

Options:
  --repo OWNER/REPO   GitHub repo allowed to authenticate (repeatable).
                      Globs allowed, e.g. 'chrisvouga/*' for all your repos.
  --ref REF           Restrict to a git ref (e.g. refs/heads/main).
                      Default: * (any branch/tag).
  --role NAME         JWT role name (default: ${ROLE_NAME})
  --policy NAME       Policy name to attach (default: ${POLICY_NAME})
  --policy-file PATH  Policy HCL file (default: config/policies/ci-read.hcl)
  --auth-path PATH    Auth mount path (default: ${AUTH_PATH})
  --audience AUD      Bound audience (default: \$VAULT_ADDR)
  --ttl DURATION      Token TTL (default: ${TOKEN_TTL})
  --max-ttl DURATION  Token max TTL (default: ${TOKEN_MAX_TTL})
  -h, --help          Show this help

Environment:
  VAULT_ADDR    Vault API address (default: https://vault.chrisvouga.dev)
  VAULT_TOKEN   Admin token (root or with auth/policy write). Resolved
                automatically from login session, ~/.vault-token, or
                init-output.json if unset.

Examples:
  ./scripts/setup-oidc-auth.sh --repo 'chrisvouga/*'
  ./scripts/setup-oidc-auth.sh --repo chrisvouga/myapp --ref refs/heads/main
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo)
      [ $# -ge 2 ] || { echo "ERROR: --repo requires a value (OWNER/REPO)" >&2; exit 1; }
      REPOS+=("$2"); shift 2 ;;
    --ref)
      [ $# -ge 2 ] || { echo "ERROR: --ref requires a value" >&2; exit 1; }
      REF="$2"; shift 2 ;;
    --role)
      [ $# -ge 2 ] || { echo "ERROR: --role requires a value" >&2; exit 1; }
      ROLE_NAME="$2"; shift 2 ;;
    --policy)
      [ $# -ge 2 ] || { echo "ERROR: --policy requires a value" >&2; exit 1; }
      POLICY_NAME="$2"; shift 2 ;;
    --policy-file)
      [ $# -ge 2 ] || { echo "ERROR: --policy-file requires a value" >&2; exit 1; }
      POLICY_FILE="$2"; shift 2 ;;
    --auth-path)
      [ $# -ge 2 ] || { echo "ERROR: --auth-path requires a value" >&2; exit 1; }
      AUTH_PATH="${2#/}"; AUTH_PATH="${AUTH_PATH%/}"; shift 2 ;;
    --audience)
      [ $# -ge 2 ] || { echo "ERROR: --audience requires a value" >&2; exit 1; }
      AUDIENCE="$2"; shift 2 ;;
    --ttl)
      [ $# -ge 2 ] || { echo "ERROR: --ttl requires a value" >&2; exit 1; }
      TOKEN_TTL="$2"; shift 2 ;;
    --max-ttl)
      [ $# -ge 2 ] || { echo "ERROR: --max-ttl requires a value" >&2; exit 1; }
      TOKEN_MAX_TTL="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

if [ "${#REPOS[@]}" -eq 0 ]; then
  echo "ERROR: at least one --repo OWNER/REPO is required" >&2
  usage >&2
  exit 1
fi

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

AUDIENCE="${AUDIENCE:-$VAULT_ADDR}"

echo "==> Verifying admin authentication..."
if ! vault_cmd token lookup >/dev/null 2>&1; then
  echo "ERROR: VAULT_TOKEN is invalid or expired (need root or auth/policy write)" >&2
  exit 1
fi

echo "==> Ensuring JWT auth method at ${AUTH_PATH}/..."
if ! vault_cmd auth list -format=json | jq -e --arg p "${AUTH_PATH}/" 'has($p)' >/dev/null; then
  vault_cmd auth enable -path="${AUTH_PATH}" jwt
else
  echo "JWT auth already enabled at ${AUTH_PATH}/"
fi

echo "==> Configuring JWT auth against GitHub's OIDC issuer..."
vault_cmd write "auth/${AUTH_PATH}/config" \
  oidc_discovery_url="${OIDC_ISSUER}" \
  bound_issuer="${OIDC_ISSUER}"

echo "==> Writing policy ${POLICY_NAME}..."
vault_cmd policy write "${POLICY_NAME}" "${POLICY_FILE}"

repos_json="$(printf '%s\n' "${REPOS[@]}" | jq -R . | jq -s .)"

# bound_claims is a map field; the CLI only accepts complex types via a full
# JSON request body (vault write <path> @file.json), not inline key=value.
ROLE_PAYLOAD="$(jq -nc \
  --argjson repos "$repos_json" \
  --arg ref "$REF" \
  --arg aud "$AUDIENCE" \
  --arg pol "$POLICY_NAME" \
  --arg ttl "$TOKEN_TTL" \
  --arg maxttl "$TOKEN_MAX_TTL" \
  '{
     role_type: "jwt",
     user_claim: "actor",
     bound_audiences: $aud,
     bound_claims_type: "glob",
     bound_claims: ({repository: $repos} + (if $ref == "*" then {} else {ref: $ref} end)),
     token_policies: $pol,
     token_no_default_policy: true,
     token_ttl: $ttl,
     token_max_ttl: $maxttl
   }')"

ROLE_FILE="$(mktemp)"
chmod 600 "$ROLE_FILE"
trap 'rm -f "$ROLE_FILE"' EXIT
printf '%s' "$ROLE_PAYLOAD" > "$ROLE_FILE"

echo "==> Creating JWT role ${ROLE_NAME}..."
vault_cmd write "auth/${AUTH_PATH}/role/${ROLE_NAME}" @"$ROLE_FILE"

echo ""
echo "================================================================================"
echo "GitHub Actions OIDC auth configured"
echo "================================================================================"
echo ""
echo "Auth mount:  ${AUTH_PATH}/"
echo "Role:        ${ROLE_NAME}"
echo "Policy:      ${POLICY_NAME}"
echo "Repos:       ${REPOS[*]}"
echo "Ref:         ${REF}"
echo "Audience:    ${AUDIENCE}"
echo "Token TTL:   ${TOKEN_TTL} (max ${TOKEN_MAX_TTL})"
echo ""
echo "Use it in a workflow (no stored VAULT_TOKEN needed):"
cat <<EOF

  permissions:
    id-token: write
    contents: read

  steps:
    - uses: hashicorp/vault-action@v3
      with:
        url: ${VAULT_ADDR}
        method: jwt
        path: ${AUTH_PATH}
        role: ${ROLE_NAME}
        secrets: |
          secret/data/personal/prd OPENAI_API_KEY | OPENAI_API_KEY
EOF
