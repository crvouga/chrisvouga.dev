#!/usr/bin/env bash
# Shared bootstrap env for vault Railway scripts (no vault run / KV required).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRA_ROOT="$(cd "${VAULT_ROOT}/.." && pwd)"

cd "${INFRA_ROOT}"

require_railway_token() {
  if [ -n "${RAILWAY_TOKEN:-}" ]; then
    export RAILWAY_TOKEN
    return 0
  fi
  if [ -f "${INFRA_ROOT}/.railway-token" ]; then
    export RAILWAY_TOKEN="$(tr -d '[:space:]' < "${INFRA_ROOT}/.railway-token")"
    return 0
  fi
  echo "ERROR: RAILWAY_TOKEN is required (export it or write to .railway-token)" >&2
  exit 1
}

normalize_cf_token() {
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CF_API_TOKEN:-}" ]; then
    export CF_API_TOKEN="${CLOUDFLARE_API_TOKEN}"
  fi
  if [ -n "${CF_API_TOKEN:-}" ] && [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    export CLOUDFLARE_API_TOKEN="${CF_API_TOKEN}"
  fi
}

require_cf_token() {
  normalize_cf_token
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CF_API_TOKEN:-}" ]; then
    echo "ERROR: CLOUDFLARE_API_TOKEN or CF_API_TOKEN is required" >&2
    exit 1
  fi
}

require_db_connection_uri() {
  if [ -n "${DB_CONNECTION_URI:-}" ]; then
    export DB_CONNECTION_URI
    return 0
  fi
  echo "ERROR: DB_CONNECTION_URI is required (export it or set GitHub secret DB_CONNECTION_URI in CI)" >&2
  exit 1
}

run_bun() {
  bun "$@"
}
