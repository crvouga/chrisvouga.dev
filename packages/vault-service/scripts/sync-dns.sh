#!/usr/bin/env bash
# Reconcile Cloudflare DNS for vault.chrisvouga.dev via railway-sync-dns.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/railway-sync-dns.sh" "$@"
