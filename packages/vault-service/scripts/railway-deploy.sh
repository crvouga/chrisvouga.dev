#!/usr/bin/env bash
# Sync Railway secrets and deploy vault image (bootstrap creds only — no vault run).
set -euo pipefail

# shellcheck source=lib/railway-bootstrap.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/railway-bootstrap.sh"

IMAGE_TAG="${IMAGE_TAG:-latest}"

require_railway_token
require_db_connection_uri
run_bun run sync-railway-secrets --id vault
run_bun run deploy-railway --id vault --image-tag "${IMAGE_TAG}" --skip-health "$@"
