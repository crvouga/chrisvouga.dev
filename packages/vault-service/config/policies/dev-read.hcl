# Read-only access to migrated secrets (KV v2 mount: secret).
path "secret/data/*" {
  capabilities = ["read"]
}

path "secret/metadata/*" {
  capabilities = ["list", "read"]
}
