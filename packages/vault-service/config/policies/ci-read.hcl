# Read-only access for CI (GitHub Actions OIDC) to the personal secrets.
path "secret/data/personal/*" {
  capabilities = ["read"]
}

path "secret/metadata/personal/*" {
  capabilities = ["list", "read"]
}
