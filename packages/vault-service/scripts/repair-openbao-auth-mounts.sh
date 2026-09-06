#!/usr/bin/env bash
# Remove duplicate auth mount rows that block OpenBao post-unseal setup.
#
# Symptom in container logs:
#   failed to mount auth entry: path=userpass/ error="cannot mount under existing mount \"auth/userpass/\""
#   post-unseal setup failed: error="failed to setup auth table"
#
# Cause: duplicate rows in secret_store.vault_kv_store at path /core/auth/ pointing at
# the same auth path (often from concurrent containers writing storage).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/db-connection.sh
source "${SCRIPT_DIR}/lib/db-connection.sh"

if [ -z "${DB_CONNECTION_URI:-}" ]; then
  echo "ERROR: DB_CONNECTION_URI is required" >&2
  exit 1
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: $1 is required. $2" >&2
    exit 1
  }
}

require_cmd psql "Install PostgreSQL client"
DB_CONNECTION_URI="$(prepare_db_connection_uri "$DB_CONNECTION_URI")"
export DB_CONNECTION_URI

echo "==> Scanning for duplicate auth mount rows in secret_store.vault_kv_store..."
DUPLICATES="$(psql_with_retry -t -A -q --no-psqlrc <<'SQL'
WITH auth_mounts AS (
  SELECT key AS mount_uuid, length(value) AS value_len
  FROM secret_store.vault_kv_store
  WHERE path = '/core/auth/'
),
referenced AS (
  SELECT DISTINCT substring(path from '/auth/([^/]+)/') AS mount_uuid
  FROM secret_store.vault_kv_store
  WHERE path LIKE '/auth/%/%'
  UNION
  SELECT DISTINCT substring(path from '/logical/([^/]+)/') AS mount_uuid
  FROM secret_store.vault_kv_store
  WHERE path LIKE '/logical/%/%'
),
orphans AS (
  SELECT a.mount_uuid, a.value_len
  FROM auth_mounts a
  LEFT JOIN referenced r ON r.mount_uuid = a.mount_uuid
  WHERE r.mount_uuid IS NULL
),
dup_sizes AS (
  SELECT value_len
  FROM orphans
  GROUP BY value_len
  HAVING COUNT(*) >= 1
    AND EXISTS (
      SELECT 1
      FROM auth_mounts am
      JOIN referenced ref ON ref.mount_uuid = am.mount_uuid
      WHERE am.value_len = orphans.value_len
    )
)
SELECT o.mount_uuid
FROM orphans o
JOIN dup_sizes d ON d.value_len = o.value_len
ORDER BY o.mount_uuid;
SQL
)"

if [ -z "$DUPLICATES" ]; then
  echo "==> No duplicate auth mount rows detected."
  exit 0
fi

echo "==> Removing orphaned duplicate auth mount row(s):"
while IFS= read -r mount_uuid; do
  [ -z "$mount_uuid" ] && continue
  echo "    - ${mount_uuid}"
  psql_with_retry -v ON_ERROR_STOP=1 -q --no-psqlrc \
    -c "DELETE FROM secret_store.vault_kv_store WHERE path = '/core/auth/' AND key = '${mount_uuid}';"
done <<< "$DUPLICATES"

echo "==> Auth mount repair complete. Re-run unseal."
