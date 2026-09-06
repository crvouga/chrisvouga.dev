#!/usr/bin/env bash
# Provision vault on Railway (bootstrap creds only — no vault run).
set -euo pipefail

# shellcheck source=lib/railway-bootstrap.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/railway-bootstrap.sh"

require_railway_token
require_db_connection_uri
run_bun run provision-railway --id vault --apply "$@"
