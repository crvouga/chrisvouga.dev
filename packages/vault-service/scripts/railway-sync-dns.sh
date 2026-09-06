#!/usr/bin/env bash
# Reconcile Cloudflare DNS for vault.chrisvouga.dev (bootstrap creds only — no vault run).
set -euo pipefail

# shellcheck source=lib/railway-bootstrap.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/railway-bootstrap.sh"

require_railway_token
require_cf_token
run_bun run sync-dns --id vault --apply --wait-for-certs "$@"
