#!/usr/bin/env bash
# Interactively prompt for and set the GitHub Actions secrets required by
# this repo's CI (deploy.yml).
#
# Use this when you don't have the values sitting in a CLI/env already —
# scripts/seed-github-secrets.sh auto-fetches from authenticated CLIs instead.
#
# Usage:
#   ./scripts/seed-github-secrets-interactive.sh
set -euo pipefail

REQUIRED_SECRETS=(
  "RAILWAY_TOKEN|Railway account API token (https://railway.com/account/tokens)"
  "CF_API_TOKEN|Cloudflare API token, Zone:DNS:Edit for chrisvouga.dev (https://dash.cloudflare.com/profile/api-tokens)"
  "DB_CONNECTION_URI|Postgres connection string used for OpenBao storage + unseal key lookup"
)

OPTIONAL_SECRETS=(
  "VAULT_TOKEN|OpenBao root/admin token, e.g. from init-output.json (leave blank to skip)"
)

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: $1 is required. $2" >&2
    exit 1
  fi
}

require_cmd gh "Install: https://cli.github.com/"
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

GITHUB_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [ -z "$GITHUB_REPO" ]; then
  echo "ERROR: Could not detect GitHub repo. Run from a linked git repository." >&2
  exit 1
fi

echo "==> GitHub repository: ${GITHUB_REPO}"

EXISTING="$(gh secret list --repo "$GITHUB_REPO" --json name -q '.[].name' 2>/dev/null || true)"

SET_NAMES=()
SKIPPED_NAMES=()

prompt_and_set() {
  local name="$1"
  local description="$2"
  local required="$3"

  local already=""
  if grep -qx "$name" <<<"$EXISTING"; then
    already=" (already set — press Enter to keep, or paste a new value to replace)"
  fi

  echo ""
  echo "${name}"
  echo "  ${description}${already}"
  printf '  Paste value (input hidden): '
  local value=""
  IFS= read -r -s value
  echo ""

  if [ -z "$value" ]; then
    if [ -n "$already" ]; then
      echo "  Keeping existing ${name}."
      SKIPPED_NAMES+=("$name (kept existing)")
      return 0
    fi
    if [ "$required" = "true" ]; then
      echo "ERROR: ${name} is required and was not provided." >&2
      exit 1
    fi
    echo "  Skipping ${name} (optional, no value provided)."
    SKIPPED_NAMES+=("$name (skipped)")
    return 0
  fi

  gh secret set "$name" --body "$value" --repo "$GITHUB_REPO"
  SET_NAMES+=("$name")
}

for entry in "${REQUIRED_SECRETS[@]}"; do
  name="${entry%%|*}"
  description="${entry#*|}"
  prompt_and_set "$name" "$description" "true"
done

for entry in "${OPTIONAL_SECRETS[@]}"; do
  name="${entry%%|*}"
  description="${entry#*|}"
  prompt_and_set "$name" "$description" "false"
done

echo ""
echo "================================================================================"
echo "Done (${GITHUB_REPO})"
echo "================================================================================"
if [ "${#SET_NAMES[@]}" -gt 0 ]; then
  echo "Set:"
  for n in "${SET_NAMES[@]}"; do echo "  - ${n}"; done
fi
if [ "${#SKIPPED_NAMES[@]}" -gt 0 ]; then
  echo "Skipped:"
  for n in "${SKIPPED_NAMES[@]}"; do echo "  - ${n}"; done
fi
