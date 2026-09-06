#!/usr/bin/env bash
# Destroy vault on Railway (bootstrap creds only — no vault run).
set -euo pipefail

# shellcheck source=lib/railway-bootstrap.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/railway-bootstrap.sh"

require_railway_token
run_bun run destroy-railway --id vault --apply "$@"
