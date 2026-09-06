#!/usr/bin/env bash
# Verify vault.chrisvouga.dev DNS and HTTPS reachability (Railway custom domain).
set -euo pipefail

HOSTNAME="${VAULT_HOSTNAME:-vault.chrisvouga.dev}"
HEALTH_PATH="${VAULT_HEALTH_PATH:-/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200}"
HEALTH_URL="https://${HOSTNAME}${HEALTH_PATH}"
DNS_RESOLVER="${DNS_RESOLVER:-1.1.1.1}"
REQUIRE_HEALTHY="${REQUIRE_HEALTHY:-false}"
REQUIRE_DNS="${REQUIRE_DNS:-true}"
RETRIES="${VERIFY_RETRIES:-12}"
RETRY_DELAY_SEC="${VERIFY_RETRY_DELAY_SEC:-10}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: $1 is required" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd dig

check_public_dns() {
  local v4
  v4="$(dig +short "${HOSTNAME}" A @"${DNS_RESOLVER}" 2>/dev/null | head -n1 || true)"
  if [ -z "$v4" ]; then
    v4="$(dig +short "${HOSTNAME}" CNAME @"${DNS_RESOLVER}" 2>/dev/null | head -n1 || true)"
  fi
  if [ -z "$v4" ]; then
    echo "ERROR: ${HOSTNAME} does not resolve on ${DNS_RESOLVER}" >&2
    return 1
  fi
  echo "==> Public DNS OK on ${DNS_RESOLVER}: ${v4}"
}

check_https() {
  local attempt code
  for attempt in $(seq 1 "$RETRIES"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 15 "${HEALTH_URL}" 2>/dev/null || true)"
    code="${code//$'\n'/}"
    if [ -z "$code" ]; then
      code="000"
    fi
    if [ "${REQUIRE_HEALTHY}" = "true" ]; then
      if [ "${code}" = "200" ]; then
        echo "==> HTTPS healthy: ${HEALTH_URL} (HTTP ${code})"
        return 0
      fi
    elif [ "${code}" = "200" ] || [ "${code}" = "503" ]; then
      echo "==> HTTPS reachable: ${HEALTH_URL} (HTTP ${code})"
      return 0
    fi
    echo "  HTTPS attempt ${attempt}/${RETRIES} — HTTP ${code}"
    sleep "${RETRY_DELAY_SEC}"
  done
  if [ "${REQUIRE_HEALTHY}" = "true" ]; then
    echo "ERROR: ${HEALTH_URL} did not return HTTP 200" >&2
  else
    echo "ERROR: ${HEALTH_URL} is not reachable (expected HTTP 200 or 503)" >&2
  fi
  return 1
}

echo "==> Verifying custom domain ${HOSTNAME} (require_healthy=${REQUIRE_HEALTHY})"

if [ "${REQUIRE_DNS}" = "true" ]; then
  check_public_dns
fi

check_https

echo "==> Custom domain verification passed"
