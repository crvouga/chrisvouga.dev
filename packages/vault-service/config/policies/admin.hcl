# Root-equivalent superuser for personal admin user.
# Full access to every path, including cluster administration.
path "*" {
  capabilities = ["create", "read", "update", "patch", "delete", "list", "sudo"]
}
