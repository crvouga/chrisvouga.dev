# Per-project .vault.yaml helpers.
# shellcheck shell=bash

VAULT_CONFIG_FILE=".vault.yaml"
VAULT_DEFAULT_MOUNT="${VAULT_DEFAULT_MOUNT:-secret}"

read_vault_yaml_value() {
  local file="$1"
  local key="$2"
  grep -E "^${key}:[[:space:]]*" "$file" 2>/dev/null \
    | head -1 \
    | sed -E "s/^${key}:[[:space:]]*//" \
    | sed -E 's/^["'\''](.*)["'\'']$/\1/'
}

find_vault_config_file() {
  local dir="$PWD"
  local git_root=""

  while [ "$dir" != "/" ]; do
    if [ -f "${dir}/${VAULT_CONFIG_FILE}" ]; then
      VAULT_CONFIG_PATH="${dir}/${VAULT_CONFIG_FILE}"
      return 0
    fi
    if [ -d "${dir}/.git" ]; then
      git_root="$dir"
      break
    fi
    dir="$(dirname "$dir")"
  done

  if [ -n "$git_root" ]; then
    dir="$git_root"
    while [ "$dir" != "/" ]; do
      if [ -f "${dir}/${VAULT_CONFIG_FILE}" ]; then
        VAULT_CONFIG_PATH="${dir}/${VAULT_CONFIG_FILE}"
        return 0
      fi
      dir="$(dirname "$dir")"
    done
  fi

  return 1
}

load_vault_config_defaults() {
  VAULT_CONFIG_ADDR=""
  VAULT_CONFIG_MOUNT=""
  VAULT_CONFIG_PROJECT=""
  VAULT_CONFIG_CONFIG=""

  if ! find_vault_config_file; then
    return 1
  fi

  VAULT_CONFIG_ADDR="$(read_vault_yaml_value "$VAULT_CONFIG_PATH" addr)"
  VAULT_CONFIG_MOUNT="$(read_vault_yaml_value "$VAULT_CONFIG_PATH" mount)"
  VAULT_CONFIG_PROJECT="$(read_vault_yaml_value "$VAULT_CONFIG_PATH" project)"
  VAULT_CONFIG_CONFIG="$(read_vault_yaml_value "$VAULT_CONFIG_PATH" config)"
  return 0
}

resolve_secret_path() {
  local cli_mount="${1:-}"
  local cli_project="${2:-}"
  local cli_config="${3:-}"
  local cli_path="${4:-}"

  if [ -n "$cli_path" ]; then
    cli_path="${cli_path#/}"
    cli_path="${cli_path%/}"
    SECRET_PATH="$cli_path"
    return 0
  fi

  local mount project config
  mount="${cli_mount:-${VAULT_MOUNT:-}}"
  project="${cli_project:-${VAULT_PROJECT:-}}"
  config="${cli_config:-${VAULT_CONFIG:-}}"

  if load_vault_config_defaults; then
    mount="${mount:-$VAULT_CONFIG_MOUNT}"
    project="${project:-$VAULT_CONFIG_PROJECT}"
    config="${config:-$VAULT_CONFIG_CONFIG}"
    if [ -z "${VAULT_ADDR:-}" ] && [ -n "$VAULT_CONFIG_ADDR" ]; then
      VAULT_ADDR="$VAULT_CONFIG_ADDR"
    fi
  fi

  mount="${mount:-$VAULT_DEFAULT_MOUNT}"
  mount="${mount#/}"
  mount="${mount%/}"

  if [ -z "$project" ] || [ -z "$config" ]; then
    echo "ERROR: Could not resolve secret path." >&2
    echo "" >&2
    echo "Provide --project and --config, set VAULT_PROJECT/VAULT_CONFIG," >&2
    echo "or run: vault setup --project <name> --config <name>" >&2
    return 1
  fi

  SECRET_PATH="${mount}/${project}/${config}"
  return 0
}

write_vault_config() {
  local addr="${1:-$VAULT_DEFAULT_ADDR}"
  local mount="${2:-$VAULT_DEFAULT_MOUNT}"
  local project="$3"
  local config="$4"
  local output="${5:-${VAULT_CONFIG_FILE}}"

  if [ -z "$project" ] || [ -z "$config" ]; then
    echo "ERROR: --project and --config are required for setup." >&2
    return 1
  fi

  cat > "$output" <<EOF
addr: ${addr}
mount: ${mount}
project: ${project}
config: ${config}
EOF

  echo "Wrote ${output}:"
  cat "$output"
}
