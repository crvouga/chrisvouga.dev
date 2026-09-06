#!/usr/bin/env bash
# Sync Railway secrets and deploy vault image (bootstrap creds only — no vault run).
set -euo pipefail

# shellcheck source=lib/railway-bootstrap.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/railway-bootstrap.sh"

IMAGE_TAG="${IMAGE_TAG:-latest}"

require_railway_token
require_db_connection_uri
run_bun run sync-railway-secrets --id vault
# Wait for the Railway deployment to reach SUCCESS so the unseal step targets
# the newly-deployed container (not a still-draining old one during the swap).
run_bun run deploy-railway --id vault --image-tag "${IMAGE_TAG}" --wait-deployment "$@"
