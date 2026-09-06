#!/usr/bin/env bash
# Print the OpenBao root token stored in crvouga.kv.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/db-connection.sh
source "${SCRIPT_DIR}/lib/db-connection.sh"

UNSEAL_KEYS_ROW="${UNSEAL_KEYS_ROW:-secret-store/unseal-keys}"

if [ -z "${DB_CONNECTION_URI:-}" ]; then
  echo "ERROR: DB_CONNECTION_URI is required" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is required (install PostgreSQL client)" >&2
  exit 1
fi

DB_CONNECTION_URI="$(prepare_db_connection_uri "$DB_CONNECTION_URI")"
export DB_CONNECTION_URI

TOKEN="$(psql_with_retry -t -A -q --no-psqlrc \
  -c "SELECT (v::jsonb) ->> 'root_token' FROM crvouga.kv WHERE k = '${UNSEAL_KEYS_ROW}'" \
  | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: root_token not found in crvouga.kv (k='${UNSEAL_KEYS_ROW}')" >&2
  exit 1
fi

printf '%s' "$TOKEN"
