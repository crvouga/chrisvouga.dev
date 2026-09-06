#!/usr/bin/env bash
# Install OpenBao CLI as `vault` for CI and local scripts.
set -euo pipefail

OPENBAO_VERSION="${OPENBAO_VERSION:-latest}"
VAULT_INSTALL_PATH="${VAULT_INSTALL_PATH:-/usr/local/bin/vault}"
REPO="openbao/openbao"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: $1 is required — $2" >&2
    exit 1
  fi
}

require_cmd curl "install curl"
require_cmd jq "install jq: https://jqlang.github.io/jq/"
require_cmd tar "install tar"

if [ "$OPENBAO_VERSION" = "latest" ]; then
  RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"
else
  OPENBAO_VERSION="${OPENBAO_VERSION#v}"
  RELEASE_URL="https://api.github.com/repos/${REPO}/releases/tags/v${OPENBAO_VERSION}"
fi

echo "==> Fetching OpenBao release metadata from ${RELEASE_URL}..."
RELEASE_JSON="$(curl -sf "$RELEASE_URL")"
TAG="$(echo "$RELEASE_JSON" | jq -r .tag_name)"
VERSION="${TAG#v}"

pick_asset_url() {
  local pattern="$1"
  echo "$RELEASE_JSON" | jq -r --arg name "$pattern" '
    .assets[] | select(.name == $name) | .browser_download_url
  ' | head -n 1
}

DOWNLOAD_URL=""
for CANDIDATE in \
  "bao_${VERSION}_Linux_x86_64.tar.gz" \
  "bao_${VERSION}_linux_amd64.tar.gz" \
  "openbao_${VERSION}_linux_amd64.tar.gz"
do
  DOWNLOAD_URL="$(pick_asset_url "$CANDIDATE")"
  if [ -n "$DOWNLOAD_URL" ] && [ "$DOWNLOAD_URL" != "null" ]; then
    break
  fi
  DOWNLOAD_URL=""
done

if [ -z "$DOWNLOAD_URL" ]; then
  echo "ERROR: No Linux x86_64 tarball found in OpenBao ${TAG} release." >&2
  echo "Available assets:" >&2
  echo "$RELEASE_JSON" | jq -r '.assets[].name' >&2
  exit 1
fi

echo "==> Downloading ${DOWNLOAD_URL}..."
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

curl -fsSL "$DOWNLOAD_URL" -o "${TMPDIR}/openbao.tar.gz"
tar -xzf "${TMPDIR}/openbao.tar.gz" -C "$TMPDIR"

BINARY=""
for CANDIDATE in "${TMPDIR}/bao" "${TMPDIR}/openbao"; do
  if [ -f "$CANDIDATE" ]; then
    BINARY="$CANDIDATE"
    break
  fi
done
if [ -z "$BINARY" ]; then
  # Some archives nest the binary one level down.
  BINARY="$(find "$TMPDIR" -maxdepth 2 -type f \( -name bao -o -name openbao \) | head -n 1)"
fi
if [ -z "$BINARY" ] || [ ! -f "$BINARY" ]; then
  echo "ERROR: bao/openbao binary not found in tarball" >&2
  exit 1
fi

INSTALL_DIR="$(dirname "$VAULT_INSTALL_PATH")"
if [ -w "$INSTALL_DIR" ]; then
  install -m 755 "$BINARY" "$VAULT_INSTALL_PATH"
else
  sudo install -m 755 "$BINARY" "$VAULT_INSTALL_PATH"
fi

if VERSION_OUTPUT="$("$VAULT_INSTALL_PATH" version 2>/dev/null)"; then
  echo "==> Installed ${VERSION_OUTPUT}"
else
  echo "==> Installed to ${VAULT_INSTALL_PATH}"
fi
