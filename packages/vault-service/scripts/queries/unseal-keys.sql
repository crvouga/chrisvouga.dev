-- Print copy-paste unseal commands from crvouga.kv.
--
-- Usage:
--   psql "$DB_CONNECTION_URI" -f scripts/queries/unseal-keys.sql
--
-- Supports JSON shapes used by scripts/unseal.sh:
--   unseal_keys_b64[], keys_base64[], keys[], or key_1 .. key_N

\pset tuples_only on
\pset format unaligned

WITH keys_row AS (
  SELECT v::jsonb AS v
  FROM crvouga.kv
  WHERE k = 'secret-store/unseal-keys'
),
keys AS (
  SELECT
    n,
    COALESCE(
      NULLIF(trim(BOTH FROM keys_row.v ->> ('key_' || n::text)), ''),
      NULLIF(trim(BOTH FROM keys_row.v -> 'unseal_keys_b64' ->> (n - 1)), ''),
      NULLIF(trim(BOTH FROM keys_row.v -> 'keys_base64' ->> (n - 1)), ''),
      NULLIF(trim(BOTH FROM keys_row.v -> 'keys' ->> (n - 1)), '')
    ) AS unseal_key
  FROM keys_row
  CROSS JOIN generate_series(1, 5) AS n
),
lines AS (
  SELECT 0 AS sort_order, 'export VAULT_ADDR="https://vault.chrisvouga.dev"' AS line

  UNION ALL
  SELECT 1, ''

  UNION ALL
  SELECT 2, '# Apply 3 of the keys below (threshold 3 of 5):'

  UNION ALL
  SELECT 3, ''

  UNION ALL
  SELECT 10 + n, format('vault operator unseal %s', unseal_key)
  FROM keys
  WHERE unseal_key IS NOT NULL

  UNION ALL
  SELECT 100, ''

  UNION ALL
  SELECT 101, 'vault status'
)
SELECT line
FROM lines
ORDER BY sort_order;
