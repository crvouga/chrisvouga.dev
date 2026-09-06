#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${REPO_ROOT}/migrations"

# shellcheck source=lib/db-connection.sh
source "${SCRIPT_DIR}/lib/db-connection.sh"

if [ -z "${DB_CONNECTION_URI:-}" ]; then
  echo "ERROR: DB_CONNECTION_URI is required" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is required (install PostgreSQL client >= 14 for Neon SNI support)" >&2
  exit 1
fi

DB_CONNECTION_URI="$(prepare_db_connection_uri "$DB_CONNECTION_URI")"
export DB_CONNECTION_URI

echo "==> Bootstrapping secret_store schema and migration tracking..."
psql_with_retry -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS secret_store;
CREATE TABLE IF NOT EXISTS secret_store.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

shopt -s nullglob
migrations=( "${MIGRATIONS_DIR}"/*.sql )
shopt -u nullglob

if [ "${#migrations[@]}" -eq 0 ]; then
  echo "ERROR: No migration files found in ${MIGRATIONS_DIR}" >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  version="$(basename "$migration")"

  applied="$(psql_with_retry -tAc \
    "SELECT 1 FROM secret_store.schema_migrations WHERE version = '${version}'")"

  if [ "$applied" = "1" ]; then
    echo "==> Skipping ${version} (already applied)"
    continue
  fi

  echo "==> Applying ${version}..."
  psql_with_retry -v ON_ERROR_STOP=1 -f "$migration"
  psql_with_retry -v ON_ERROR_STOP=1 \
    -c "INSERT INTO secret_store.schema_migrations (version) VALUES ('${version}');"
done

echo "==> All migrations applied."
