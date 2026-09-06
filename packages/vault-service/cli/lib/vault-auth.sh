# Shared Vault authentication helpers for secret-store CLI.
# shellcheck shell=bash

VAULT_DEFAULT_ADDR="${VAULT_DEFAULT_ADDR:-https://vault.chrisvouga.dev}"

is_vault_cli() {
  local bin="$1"
  local version_output

  [ -x "$bin" ] || return 1
  version_output="$("$bin" version 2>/dev/null)" || return 1
  printf '%s' "$version_output" | grep -qiE 'vault|openbao'
}

try_vault_candidate() {
  local candidate="$1"

  if [ -n "$candidate" ] && [ -x "$candidate" ] && is_vault_cli "$candidate"; then
    VAULT_REAL_BIN="$candidate"
    return 0
  fi

  return 1
}

resolve_vault_bin() {
  if [ -n "${VAULT_REAL_BIN:-}" ] && try_vault_candidate "$VAULT_REAL_BIN"; then
    return 0
  fi
  VAULT_REAL_BIN=""

  local candidate current_vault
  current_vault="$(command -v vault 2>/dev/null || true)"

  for candidate in vault-real openbao bao; do
    candidate="$(command -v "$candidate" 2>/dev/null || true)"
    if try_vault_candidate "$candidate"; then
      return 0
    fi
  done

  for candidate in /opt/homebrew/bin/vault /usr/local/bin/vault \
    /opt/homebrew/bin/openbao /usr/local/bin/openbao \
    /opt/homebrew/bin/bao /usr/local/bin/bao; do
    if try_vault_candidate "$candidate"; then
      return 0
    fi
  done

  if [ -n "$current_vault" ] && [ -f "$current_vault" ] \
    && ! grep -q "secret-store-vault-wrapper" "$current_vault" 2>/dev/null \
    && try_vault_candidate "$current_vault"; then
    return 0
  fi

  return 1
}

resolve_init_output_file() {
  if [ -n "${SECRET_STORE_INIT_OUTPUT:-}" ] && [ -f "${SECRET_STORE_INIT_OUTPUT}" ]; then
    INIT_OUTPUT_FILE="${SECRET_STORE_INIT_OUTPUT}"
    return 0
  fi

  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -f "${dir}/init-output.json" ]; then
      INIT_OUTPUT_FILE="${dir}/init-output.json"
      return 0
    fi
    if [ -d "${dir}/.git" ]; then
      break
    fi
    dir="$(dirname "$dir")"
  done

  if [ -f "${HOME}/.local/share/secret-store/init-output.json" ]; then
    INIT_OUTPUT_FILE="${HOME}/.local/share/secret-store/init-output.json"
    return 0
  fi

  return 1
}

resolve_vault_token() {
  if [ -n "${VAULT_TOKEN:-}" ]; then
    return 0
  fi

  if resolve_vault_bin; then
    local token
    token="$(
      VAULT_ADDR="${VAULT_ADDR:-$VAULT_DEFAULT_ADDR}" \
        "$VAULT_REAL_BIN" print token 2>/dev/null || true
    )"
    if [ -n "$token" ]; then
      VAULT_TOKEN="$token"
      return 0
    fi
  fi

  if [ -f "${HOME}/.vault-token" ]; then
    VAULT_TOKEN="$(tr -d '\n\r' < "${HOME}/.vault-token")"
    if [ -n "$VAULT_TOKEN" ]; then
      return 0
    fi
  fi

  if resolve_init_output_file && command -v jq >/dev/null 2>&1; then
    VAULT_TOKEN="$(jq -r '.root_token // empty' "$INIT_OUTPUT_FILE")"
    if [ -n "$VAULT_TOKEN" ] && [ "$VAULT_TOKEN" != "null" ]; then
      return 0
    fi
    VAULT_TOKEN=""
  fi

  return 1
}

export_vault_auth() {
  VAULT_ADDR="${VAULT_ADDR:-$VAULT_DEFAULT_ADDR}"
  export VAULT_ADDR

  if ! resolve_vault_token; then
    echo "ERROR: Could not resolve Vault token." >&2
    echo "" >&2
    echo "Authenticate with one of:" >&2
    echo "  vault login -address=\"${VAULT_ADDR}\"" >&2
    echo "  export VAULT_TOKEN='...'" >&2
    echo "  ./scripts/create-dev-token.sh   # scoped read token" >&2
    return 1
  fi

  export VAULT_TOKEN
  return 0
}

require_cmd() {
  local cmd="$1"
  local install_hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: ${cmd} is required. ${install_hint}" >&2
    exit 1
  fi
}

vault_cmd() {
  if ! resolve_vault_bin; then
    echo "ERROR: Vault CLI binary not found." >&2
    echo "       Install Vault or OpenBao CLI, or set VAULT_REAL_BIN." >&2
    return 1
  fi
  VAULT_ADDR="${VAULT_ADDR:-$VAULT_DEFAULT_ADDR}" \
    VAULT_TOKEN="${VAULT_TOKEN:-}" \
    "$VAULT_REAL_BIN" "$@"
}

# zsh interactive shells omit INTERACTIVE_COMMENTS by default, so pasted
# "cmd --flag  # note" forwards "#" as an argument. Drop from first # token.
drop_trailing_shell_comment_args() {
  DROPPED_COMMENT_ARGS=()
  local arg
  for arg in "$@"; do
    case "$arg" in
      '#'* )
        break
        ;;
    esac
    DROPPED_COMMENT_ARGS+=("$arg")
  done
}
