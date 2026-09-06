CREATE SCHEMA IF NOT EXISTS secret_store;

CREATE TABLE IF NOT EXISTS secret_store.vault_kv_store (
  parent_path TEXT COLLATE "C" NOT NULL,
  path        TEXT COLLATE "C",
  key         TEXT COLLATE "C",
  value       BYTEA,
  CONSTRAINT vault_kv_store_pkey PRIMARY KEY (path, key)
);

CREATE INDEX IF NOT EXISTS vault_kv_store_idx
  ON secret_store.vault_kv_store (parent_path);

CREATE TABLE IF NOT EXISTS secret_store.vault_ha_locks (
  ha_key      TEXT COLLATE "C" NOT NULL,
  ha_identity TEXT COLLATE "C" NOT NULL,
  ha_value    TEXT COLLATE "C",
  valid_until TIMESTAMPTZ NOT NULL,
  CONSTRAINT vault_ha_locks_pkey PRIMARY KEY (ha_key)
);
