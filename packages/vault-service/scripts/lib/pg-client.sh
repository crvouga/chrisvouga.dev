# Resolve PostgreSQL client binaries compatible with a remote server version.
# shellcheck shell=bash

PG_DUMP_BIN=""
PG_RESTORE_BIN=""
PSQL_BIN=""
PG_USE_DOCKER=false
PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-}"

pg_bin_major() {
  local bin="$1"
  local version_line major

  version_line="$("$bin" --version 2>/dev/null)" || return 1
  major="$(printf '%s' "$version_line" | sed -nE 's/.*[^0-9]([0-9]+)\.[0-9]+.*/\1/p' | head -1)"
  if [ -z "$major" ]; then
    return 1
  fi
  printf '%s' "$major"
}

postgres_server_major() {
  local url="$1"
  local psql_bin version_num

  psql_bin="$(command -v psql 2>/dev/null || true)"
  if [ -z "$psql_bin" ]; then
    for prefix in /opt/homebrew/opt/postgresql@18 /opt/homebrew/opt/postgresql@17 \
      /opt/homebrew/opt/postgresql@16 /opt/homebrew/opt/postgresql@15 \
      /opt/homebrew/opt/postgresql@14 \
      /usr/local/opt/postgresql@18 /usr/local/opt/postgresql@17 \
      /usr/local/opt/postgresql@16 /usr/local/opt/postgresql@15 \
      /usr/local/opt/postgresql@14; do
      if [ -x "${prefix}/bin/psql" ]; then
        psql_bin="${prefix}/bin/psql"
        break
      fi
    done
  fi

  if [ -z "$psql_bin" ]; then
    echo "ERROR: psql is required to detect remote Postgres server version" >&2
    return 1
  fi

  version_num="$(
    "$psql_bin" "$url" -t -A -c "SHOW server_version_num" 2>/dev/null | tr -d '[:space:]'
  )"
  if [ -z "$version_num" ] || ! [[ "$version_num" =~ ^[0-9]+$ ]]; then
    echo "ERROR: Could not read server_version_num from source database" >&2
    return 1
  fi

  echo $((version_num / 10000))
}

collect_pg_bin_candidates() {
  local tool="$1"
  local seen="" candidate prefix override

  append() {
    candidate="$1"
    [ -z "$candidate" ] && return 0
    [ -x "$candidate" ] || return 0
    case " ${seen} " in
      *" ${candidate} "*) return 0 ;;
    esac
    seen="${seen} ${candidate}"
    printf '%s\n' "$candidate"
  }

  append "$(command -v "$tool" 2>/dev/null || true)"

  case "$tool" in
    pg_dump) override="${PG_DUMP_BIN:-${PG_DUMP:-}}" ;;
    pg_restore) override="${PG_RESTORE_BIN:-${PG_RESTORE:-}}" ;;
    psql) override="${PSQL_BIN:-${PSQL:-}}" ;;
    *) override="" ;;
  esac
  append "$override"

  for prefix in /opt/homebrew/opt/postgresql@18 /opt/homebrew/opt/postgresql@17 \
    /opt/homebrew/opt/postgresql@16 /opt/homebrew/opt/postgresql@15 \
    /opt/homebrew/opt/postgresql@14 \
    /usr/local/opt/postgresql@18 /usr/local/opt/postgresql@17 \
    /usr/local/opt/postgresql@16 /usr/local/opt/postgresql@15 \
    /usr/local/opt/postgresql@14; do
    append "${prefix}/bin/${tool}"
  done
}

find_pg_bin_at_least() {
  local tool="$1"
  local min_major="$2"
  local best=""
  local best_major=0
  local candidate major

  while IFS= read -r candidate; do
    [ -z "$candidate" ] && continue
    major="$(pg_bin_major "$candidate")" || continue
    if [ "$major" -ge "$min_major" ] && [ "$major" -ge "$best_major" ]; then
      best="$candidate"
      best_major="$major"
    fi
  done < <(collect_pg_bin_candidates "$tool")

  if [ -n "$best" ]; then
    printf '%s' "$best"
    return 0
  fi

  return 1
}

pg_client_install_hint() {
  local server_major="$1"
  cat <<EOF
pg_dump must be the same major version as the server (or newer).
Server major version: ${server_major}

Install matching clients, then re-run:

  brew install postgresql@${server_major}
  export PATH="/opt/homebrew/opt/postgresql@${server_major}/bin:\$PATH"

Or ensure Docker is running (used automatically when local clients are too old):

  export PG_DOCKER_IMAGE=postgres:${server_major}
EOF
}

docker_pg_available() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

resolve_pg_toolchain() {
  local source_url="$1"
  local server_major

  server_major="$(postgres_server_major "$source_url")" || return 1

  PG_DUMP_BIN="$(find_pg_bin_at_least pg_dump "$server_major" || true)"
  PG_RESTORE_BIN="$(find_pg_bin_at_least pg_restore "$server_major" || true)"
  PSQL_BIN="$(find_pg_bin_at_least psql "$server_major" || true)"

  if [ -n "$PG_DUMP_BIN" ] && [ -n "$PG_RESTORE_BIN" ] && [ -n "$PSQL_BIN" ]; then
    PG_USE_DOCKER=false
    echo "==> Using local PostgreSQL clients (pg_dump $(pg_bin_major "$PG_DUMP_BIN")) for server ${server_major}"
    return 0
  fi

  if docker_pg_available; then
    PG_USE_DOCKER=true
    PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-postgres:${server_major}}"
    PG_DUMP_BIN=""
    PG_RESTORE_BIN=""
    PSQL_BIN=""
    echo "==> Local pg_dump is older than server ${server_major}; using Docker image ${PG_DOCKER_IMAGE}"
    return 0
  fi

  pg_client_install_hint "$server_major" >&2
  return 1
}

pg_dump_to_file() {
  local source_url="$1"
  local output_file="$2"
  shift 2
  local out_dir out_base

  if [ "$PG_USE_DOCKER" = true ]; then
    out_dir="$(cd "$(dirname "$output_file")" && pwd)"
    out_base="$(basename "$output_file")"
    docker run --rm \
      -v "${out_dir}:/out" \
      "$PG_DOCKER_IMAGE" \
      pg_dump "$@" --file="/out/${out_base}" "$source_url"
    return $?
  fi

  "$PG_DUMP_BIN" "$@" --file="$output_file" "$source_url"
}

pg_restore_from_file() {
  local target_url="$1"
  local input_file="$2"
  shift 2
  local in_dir in_base

  if [ "$PG_USE_DOCKER" = true ]; then
    in_dir="$(cd "$(dirname "$input_file")" && pwd)"
    in_base="$(basename "$input_file")"
    docker run --rm \
      -v "${in_dir}:/in" \
      "$PG_DOCKER_IMAGE" \
      pg_restore "$@" --dbname="$target_url" "/in/${in_base}"
    return $?
  fi

  "$PG_RESTORE_BIN" "$@" --dbname="$target_url" "$input_file"
}

psql_with_url() {
  local url="$1"
  shift

  if [ "$PG_USE_DOCKER" = true ]; then
    docker run --rm \
      "$PG_DOCKER_IMAGE" \
      psql "$url" "$@"
    return $?
  fi

  "$PSQL_BIN" "$url" "$@"
}
