# Shared Neon Postgres connection helpers for CI scripts.
# shellcheck shell=bash

append_query_param() {
  local uri="$1"
  local param="$2"
  local key="${param%%=*}"

  if [[ "$uri" == *"${key}="* ]]; then
    printf '%s' "$uri"
    return 0
  fi

  case "$uri" in
    *\?*) printf '%s&%s' "$uri" "$param" ;;
    *) printf '%s?%s' "$uri" "$param" ;;
  esac
}

prepare_db_connection_uri() {
  local uri="${1:-}"
  local connect_timeout="${2:-30}"

  if [ -z "$uri" ]; then
    echo "ERROR: DB connection URI is empty" >&2
    return 1
  fi

  append_query_param "$uri" "connect_timeout=${connect_timeout}"
}

psql_with_retry() {
  local max_attempts="${PSQL_MAX_ATTEMPTS:-6}"
  local delay="${PSQL_RETRY_DELAY:-10}"
  local attempt

  for attempt in $(seq 1 "$max_attempts"); do
    if psql "$DB_CONNECTION_URI" "$@"; then
      return 0
    fi

    if [ "$attempt" -eq "$max_attempts" ]; then
      echo "ERROR: psql failed after ${max_attempts} attempt(s)" >&2
      return 1
    fi

    echo "==> psql failed (attempt ${attempt}/${max_attempts}); retrying in ${delay}s (Neon compute may be waking)..."
    sleep "$delay"
  done
}
