#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"

usage() {
  cat <<EOF
Usage: $(basename "$0") -- <command> [args...]

Run a command with Vault credentials exported to the environment.

Resolves credentials in order:
  1. VAULT_TOKEN already in the environment
  2. Token from \`vault login\` session (\`vault print token\`)
  3. ~/.vault-token
  4. Root token from init-output.json (after ./scripts/init.sh)

Environment:
  VAULT_ADDR   Vault API address (default: https://vault.chrisvouga.dev)

Examples:
  $(basename "$0") -- ./scripts/smoke-test.sh
  $(basename "$0") -- ./scripts/sync-dev-keys-to-prd.sh --dry-run
EOF
}

if [ "${1:-}" = "--" ]; then
  shift
fi

drop_trailing_shell_comment_args "$@"
set -- "${DROPPED_COMMENT_ARGS[@]}"

if [ $# -eq 0 ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit "$([ $# -eq 0 ] && echo 1 || echo 0)"
fi

if ! export_vault_auth; then
  exit 1
fi

exec "$@"
