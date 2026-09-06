# Read-only access for personal app runtime tokens (KV v2 mount: secret).
path "secret/data/personal/*" {
  capabilities = ["read"]
}

path "secret/metadata/personal/*" {
  capabilities = ["list", "read"]
}
