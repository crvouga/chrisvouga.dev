# vault run — fetch KV secrets and inject as environment variables.
# shellcheck shell=bash

vault_run_usage() {
  cat <<EOF
Usage: vault run [OPTIONS] -- <command> [args...]

Fetch secrets from Vault and run a command with them injected as env vars.

Options:
  --path PATH       Full KV path (e.g. secret/myapp/dev)
  --mount PATH      KV mount (default: secret, or from .vault.yaml)
  --project NAME    Logical project name
  --config NAME     Environment config name
  --dry-run         Print secret path and env var names only (no values)
  -h, --help        Show this help

Config resolution (first match wins):
  1. CLI flags (--path, or --mount + --project + --config)
  2. Environment: VAULT_MOUNT, VAULT_PROJECT, VAULT_CONFIG
  3. .vault.yaml in current directory or parent (up to git root)

Examples:
  vault setup --project myapp --config dev
  vault run -- bun myserver.tsx
  vault run --project myapp --config prd -- npm start
  vault run --dry-run -- bun test
EOF
}

vault_run() {
  local cli_mount="" cli_project="" cli_config="" cli_path="" dry_run=false
  local -a cmd=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --mount)
        cli_mount="$2"
        shift 2
        ;;
      --project)
        cli_project="$2"
        shift 2
        ;;
      --config)
        cli_config="$2"
        shift 2
        ;;
      --path)
        cli_path="$2"
        shift 2
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      -h|--help)
        vault_run_usage
        return 0
        ;;
      --)
        shift
        cmd=("$@")
        break
        ;;
      *)
        echo "ERROR: Unknown option: $1" >&2
        vault_run_usage >&2
        return 1
        ;;
    esac
  done

  if [ "${#cmd[@]}" -eq 0 ]; then
    echo "ERROR: No command specified. Use -- before the command." >&2
    vault_run_usage >&2
    return 1
  fi

  require_cmd jq "Install jq: https://jqlang.github.io/jq/"

  if ! export_vault_auth; then
    return 1
  fi

  if ! resolve_vault_bin; then
    echo "ERROR: Vault CLI binary not found." >&2
    echo "       Install Vault or OpenBao CLI and ensure it is on PATH," >&2
    echo "       or set VAULT_REAL_BIN to the real binary path." >&2
    return 1
  fi

  if ! resolve_secret_path "$cli_mount" "$cli_project" "$cli_config" "$cli_path"; then
    return 1
  fi

  echo "==> Fetching secrets from ${SECRET_PATH}..."

  local secret_json
  secret_json="$(
    VAULT_ADDR="$VAULT_ADDR" VAULT_TOKEN="$VAULT_TOKEN" \
      "$VAULT_REAL_BIN" kv get -format=json "$SECRET_PATH" 2>&1
  )" || {
    if echo "$secret_json" | grep -qi "sealed"; then
      echo "ERROR: Vault is sealed. Unseal before running commands." >&2
    elif echo "$secret_json" | grep -qi "permission denied\|403"; then
      echo "ERROR: Token lacks read access to ${SECRET_PATH}." >&2
      echo "       Run: ./scripts/create-dev-token.sh" >&2
    else
      echo "ERROR: Failed to read secret at ${SECRET_PATH}." >&2
      echo "$secret_json" >&2
    fi
    return 1
  }

  local key_count
  key_count="$(echo "$secret_json" | jq '.data.data | length')"

  if [ "$key_count" -eq 0 ]; then
    echo "ERROR: Secret at ${SECRET_PATH} has no fields." >&2
    return 1
  fi

  if [ "$dry_run" = true ]; then
    echo "Secret path: ${SECRET_PATH}"
    echo "Would inject ${key_count} environment variable(s):"
    echo "$secret_json" | jq -r '.data.data | keys[]' | sed 's/^/  /'
    echo "Command: ${cmd[*]}"
    return 0
  fi

  eval "$(
    echo "$secret_json" \
      | jq -r '.data.data | to_entries[] | "export \(.key)=\(.value|@sh)"'
  )"

  echo "==> Injected ${key_count} secret(s). Running: ${cmd[*]}"
  exec "${cmd[@]}"
}

vault_setup_usage() {
  cat <<EOF
Usage: vault setup [OPTIONS]

Write a .vault.yaml config file in the current directory.

Options:
  --project NAME   Project name (required)
  --config NAME    Config/environment name (required)
  --mount PATH     KV mount (default: secret)
  --addr URL       Vault address (default: https://vault.chrisvouga.dev)
  -h, --help       Show this help

Example:
  vault setup --project myapp --config dev
EOF
}

vault_setup() {
  local project="" config="" mount="" addr=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --project)
        project="$2"
        shift 2
        ;;
      --config)
        config="$2"
        shift 2
        ;;
      --mount)
        mount="$2"
        shift 2
        ;;
      --addr)
        addr="$2"
        shift 2
        ;;
      -h|--help)
        vault_setup_usage
        return 0
        ;;
      *)
        echo "ERROR: Unknown option: $1" >&2
        vault_setup_usage >&2
        return 1
        ;;
    esac
  done

  write_vault_config \
    "${addr:-${VAULT_ADDR:-$VAULT_DEFAULT_ADDR}}" \
    "${mount:-$VAULT_DEFAULT_MOUNT}" \
    "$project" \
    "$config"
}
