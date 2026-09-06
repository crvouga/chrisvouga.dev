#!/usr/bin/env bash
# Auto-unseal OpenBao after deploy using keys stored in crvouga.kv.
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-https://vault.chrisvouga.dev}"
UNSEAL_THRESHOLD_OVERRIDE="${UNSEAL_THRESHOLD:-}"
UNSEAL_KEYS_ROW="${UNSEAL_KEYS_ROW:-secret-store/unseal-keys}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"
# shellcheck source=lib/db-connection.sh
source "${SCRIPT_DIR}/lib/db-connection.sh"

if [ -z "${DB_CONNECTION_URI:-}" ]; then
  echo "ERROR: DB_CONNECTION_URI is required" >&2
  exit 1
fi

require_cmd psql "Install PostgreSQL client"
require_cmd curl "Install curl"
require_cmd jq "Install jq: https://jqlang.github.io/jq/"

if ! resolve_vault_bin; then
  echo "ERROR: vault CLI is required (https://openbao.org/docs/install/)" >&2
  exit 1
fi

export VAULT_ADDR
DB_CONNECTION_URI="$(prepare_db_connection_uri "$DB_CONNECTION_URI")"
export DB_CONNECTION_URI

# OpenBao returns 503 on /sys/health when sealed; treat sealed/uninit as reachable.
HEALTH_URL="${VAULT_ADDR}/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200"

echo "==> Waiting for OpenBao at ${VAULT_ADDR}..."
for i in $(seq 1 60); do
  if curl -sf "${HEALTH_URL}" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: OpenBao did not become reachable within 5 minutes" >&2
    exit 1
  fi
  sleep 5
done

echo "==> Fetching unseal keys from crvouga.kv (in case OpenBao is sealed)..."
KEYS_JSON="$(psql_with_retry -t -A -q --no-psqlrc \
  -c "SELECT v::text FROM crvouga.kv WHERE k = '${UNSEAL_KEYS_ROW}'" \
  | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

if [ -z "$KEYS_JSON" ]; then
  echo "ERROR: No unseal keys found at crvouga.kv (k='${UNSEAL_KEYS_ROW}')" >&2
  echo "       Populate crvouga.kv with keys_base64, unseal_keys_b64, or key_1..key_N in v." >&2
  exit 1
fi

# crvouga.kv.v may be stored double-encoded (a JSON string containing JSON).
# Unwrap until we land on an object, so extraction below sees the real shape.
for _ in 1 2 3; do
  if echo "$KEYS_JSON" | jq -e 'type == "string"' >/dev/null 2>&1; then
    KEYS_JSON="$(echo "$KEYS_JSON" | jq -r '.')"
  else
    break
  fi
done

if ! echo "$KEYS_JSON" | jq -e . >/dev/null 2>&1; then
  echo "ERROR: Unseal keys at crvouga.kv (k='${UNSEAL_KEYS_ROW}') are not valid JSON" >&2
  exit 1
fi

# --- Debug: show the shape of the stored value without leaking key material ---
echo "==> [debug] unseal-keys JSON shape:"
echo "$KEYS_JSON" | jq -r '
  if type == "object" then
    "    top-level type: object",
    "    top-level keys: " + ([keys[]] | join(", ")),
    (to_entries[]
      | if (.value | type) == "array"
        then "    ." + .key + ": array(len=" + (.value | length | tostring) + ")"
        else "    ." + .key + ": " + (.value | type) end)
  else
    "    top-level type: " + type
  end
' >&2 || true

# Fingerprint a key without revealing it: length, first/last chars, sha256 prefix.
fingerprint_key() {
  local key="$1"
  local len="${#key}"
  local head="${key:0:4}"
  local tail="${key: -4}"
  local sum="n/a"
  if command -v sha256sum >/dev/null 2>&1; then
    sum="$(printf '%s' "$key" | sha256sum | cut -c1-12)"
  elif command -v shasum >/dev/null 2>&1; then
    sum="$(printf '%s' "$key" | shasum -a 256 | cut -c1-12)"
  fi
  printf 'len=%s head=%q tail=%q sha256=%s' "$len" "$head" "$tail" "$sum"
}

# Dump seal-status progress fields (no secrets) so we can see if a key landed.
dump_seal_status() {
  local label="$1"
  local status
  status="$(curl -sf "${VAULT_ADDR}/v1/sys/seal-status" 2>/dev/null || echo '{}')"
  echo "    [debug] seal-status ${label}: $(echo "$status" | jq -rc '{sealed, t, n, progress, version, type}')" >&2
}

# Canonical liveness probe. /sys/health status codes (no sealedcode override so
# 503 distinctly means sealed):
#   200 active+unsealed, 429 standby+unsealed, 472 DR standby, 473 perf standby,
#   501 not initialized, 503 sealed.
health_indicates_unsealed() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' \
    "${VAULT_ADDR}/v1/sys/health?standbyok=true&perfstandbyok=true" 2>/dev/null || echo 000)"
  case "$code" in
    200 | 429 | 472 | 473) return 0 ;;
    *) return 1 ;;
  esac
}

# A single /sys/seal-status read off the public LB is unreliable (it can hit a
# node mid-transition, a standby, or a brief restart). Corroborate with the
# health endpoint and treat sealed=false from either signal as unsealed.
check_unsealed() {
  local status sealed
  status="$(curl -sf "${VAULT_ADDR}/v1/sys/seal-status" 2>/dev/null || echo '{}')"
  sealed="$(echo "$status" | jq -r '.sealed // empty')"
  if [ "$sealed" = "false" ]; then
    return 0
  fi
  if [ "$sealed" != "true" ] && health_indicates_unsealed; then
    return 0
  fi
  return 1
}

# Unseal completion is asynchronous: after the threshold key the node briefly
# still reports sealed=true while it finishes post-unseal setup, then flips to
# sealed=false. Poll (tolerating transient/flapping reads) before deciding.
wait_unsealed() {
  local timeout="$1"
  local elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    if check_unsealed; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

SEAL_STATUS="$(curl -sf "${VAULT_ADDR}/v1/sys/seal-status")"
UNSEAL_THRESHOLD="$(echo "$SEAL_STATUS" | jq -r '.t // empty')"
if [ -z "$UNSEAL_THRESHOLD" ] || [ "$UNSEAL_THRESHOLD" = "null" ]; then
  UNSEAL_THRESHOLD="${UNSEAL_THRESHOLD_OVERRIDE:-3}"
fi

# Strip surrounding whitespace and a single layer of wrapping quotes that can
# sneak in when keys are stored as double-encoded JSON strings.
sanitize_key() {
  local key="$1"
  key="$(printf '%s' "$key" | tr -d '\n\r')"
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  if [ "${key#\"}" != "$key" ] && [ "${key%\"}" != "$key" ]; then
    key="${key#\"}"
    key="${key%\"}"
  fi
  printf '%s' "$key"
}

extract_unseal_key() {
  local keys_json="$1"
  local index="$2"
  local idx=$((index - 1))
  local key

  key="$(echo "$keys_json" | jq -r --arg n "$index" '.["key_" + $n] // empty')"
  if [ -n "$key" ]; then
    sanitize_key "$key"
    return 0
  fi

  key="$(echo "$keys_json" | jq -r --argjson idx "$idx" '.unseal_keys_b64[$idx] // empty')"
  if [ -n "$key" ]; then
    sanitize_key "$key"
    return 0
  fi

  key="$(echo "$keys_json" | jq -r --argjson idx "$idx" '.keys_base64[$idx] // empty')"
  if [ -n "$key" ]; then
    sanitize_key "$key"
    return 0
  fi

  key="$(echo "$keys_json" | jq -r --argjson idx "$idx" '.keys[$idx] // empty')"
  if [ -n "$key" ]; then
    sanitize_key "$key"
    return 0
  fi

  return 1
}

if check_unsealed; then
  echo "==> OpenBao is already unsealed."
  exit 0
fi

count_available_keys() {
  echo "$KEYS_JSON" | jq -r '
    if (.keys_base64 | type) == "array" then (.keys_base64 | length)
    elif (.unseal_keys_b64 | type) == "array" then (.unseal_keys_b64 | length)
    elif (.keys | type) == "array" then (.keys | length)
    else
      ([range(1; 20) | select(.["key_" + (. | tostring)] != null)] | length)
    end
  '
}

KEY_COUNT="$(count_available_keys)"
if [ -z "$KEY_COUNT" ] || [ "$KEY_COUNT" = "0" ] || [ "$KEY_COUNT" = "null" ]; then
  echo "ERROR: No unseal keys found in crvouga.kv payload" >&2
  exit 1
fi

echo "==> Applying unseal keys (threshold=${UNSEAL_THRESHOLD}, stored=${KEY_COUNT})..."
dump_seal_status "before"

# Track fingerprints to catch duplicate shares (a top cause of "still sealed").
SEEN_FINGERPRINTS=""
PREV_PROGRESS="$(curl -sf "${VAULT_ADDR}/v1/sys/seal-status" 2>/dev/null | jq -r '.progress // 0')"
KEYS_TRIED=0

for i in $(seq 1 "$KEY_COUNT"); do
  if check_unsealed; then
    echo "==> OpenBao unsealed successfully."
    exit 0
  fi

  KEY="$(extract_unseal_key "$KEYS_JSON" "$i" || true)"
  if [ -z "$KEY" ]; then
    echo "    [debug] skip key slot ${i}/${KEY_COUNT} (empty)" >&2
    continue
  fi

  KEY_FP="$(fingerprint_key "$KEY")"
  KEY_SUM="${KEY_FP##*sha256=}"
  case " ${SEEN_FINGERPRINTS} " in
    *" ${KEY_SUM} "*)
      echo "    Unseal key ${i}/${KEY_COUNT} [debug] ${KEY_FP} (duplicate — skip)" >&2
      continue
      ;;
  esac
  SEEN_FINGERPRINTS="${SEEN_FINGERPRINTS} ${KEY_SUM}"
  KEYS_TRIED=$((KEYS_TRIED + 1))

  echo "    Unseal key ${i}/${KEY_COUNT} [debug] ${KEY_FP}"

  UNSEAL_OUTPUT="$(vault_cmd operator unseal "$KEY" 2>&1)" || {
    echo "$UNSEAL_OUTPUT" >&2
    if echo "$UNSEAL_OUTPUT" | grep -qi "failed to setup auth table"; then
      echo "ERROR: OpenBao post-unseal setup failed (duplicate auth mount in storage)." >&2
      echo "       Run: ./scripts/repair-openbao-auth-mounts.sh" >&2
    fi
    exit 1
  }

  STATUS="$(curl -sf "${VAULT_ADDR}/v1/sys/seal-status" 2>/dev/null || echo '{}')"
  SEALED="$(echo "$STATUS" | jq -r '.sealed // true')"
  PROGRESS="$(echo "$STATUS" | jq -r '.progress // 0')"
  echo "    [debug] progress after key ${i}: ${PREV_PROGRESS} -> ${PROGRESS} (sealed=${SEALED})" >&2

  if wait_unsealed 10; then
    echo "==> OpenBao unsealed successfully."
    exit 0
  fi

  if [ "$PROGRESS" = "$PREV_PROGRESS" ] && [ "$PROGRESS" != "0" ]; then
    echo "    [debug] WARNING: progress did NOT advance — trying next stored key." >&2
  elif [ "$PROGRESS" = "0" ] && [ "$KEYS_TRIED" -lt "$UNSEAL_THRESHOLD" ]; then
    echo "    [debug] WARNING: progress reset to 0 before reaching threshold — key may be invalid." >&2
  fi
  PREV_PROGRESS="$PROGRESS"
done

dump_seal_status "after-all-keys"
if wait_unsealed 30; then
  echo "==> OpenBao unsealed successfully."
  exit 0
fi

FINAL_PROGRESS="$(curl -sf "${VAULT_ADDR}/v1/sys/seal-status" 2>/dev/null | jq -r '.progress // 0')"
echo "ERROR: OpenBao is still sealed after trying ${KEYS_TRIED} unique key(s) from ${KEY_COUNT} stored slot(s)" >&2
echo "       Final progress=${FINAL_PROGRESS}/${UNSEAL_THRESHOLD}." >&2
if [ "$FINAL_PROGRESS" -lt "$UNSEAL_THRESHOLD" ] 2>/dev/null; then
  echo "       Progress < threshold means accepted keys did not count toward unseal:" >&2
  echo "         - duplicate keys (same share applied twice), or" >&2
  echo "         - keys from a previous init that don't match this node's seal." >&2
  echo "       Compare the sha256 fingerprints above; if any repeat, the stored" >&2
  echo "       keys are duplicated. If all are unique, they are stale — re-fetch" >&2
  echo "       the current init's keys into crvouga.kv (k='${UNSEAL_KEYS_ROW}')." >&2
fi
exit 1
