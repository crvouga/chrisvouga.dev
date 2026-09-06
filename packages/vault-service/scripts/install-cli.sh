#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLI_SRC="${REPO_ROOT}/cli"
INSTALL_ROOT="${SECRET_STORE_INSTALL_ROOT:-${HOME}/.local/share/secret-store}"
INSTALL_CLI="${INSTALL_ROOT}/cli"
INSTALL_BIN="${HOME}/.local/bin"
WRAPPER_MARKER="secret-store-vault-wrapper"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Install the secret-store vault CLI wrapper globally.

The wrapper adds run and setup subcommands:
  vault run -- <command>     Inject secrets from Vault as env vars
  vault setup                Write .vault.yaml in your project

All other vault subcommands pass through to the real Vault/OpenBao binary.

Options:
  --prefix PATH   Install root (default: ~/.local/share/secret-store)
  -h, --help      Show this help

Requires:
  Vault or OpenBao CLI installed separately: https://openbao.org/docs/install/
  ~/.local/bin on your PATH
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)
      INSTALL_ROOT="$2"
      INSTALL_CLI="${INSTALL_ROOT}/cli"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ ! -d "${CLI_SRC}/bin" ] || [ ! -d "${CLI_SRC}/lib" ]; then
  echo "ERROR: cli/ directory not found at ${CLI_SRC}" >&2
  exit 1
fi

mkdir -p "$INSTALL_CLI" "$INSTALL_BIN"

echo "==> Installing CLI library to ${INSTALL_CLI}..."
rm -rf "${INSTALL_CLI:?}/"*
cp -R "${CLI_SRC}/bin" "${CLI_SRC}/lib" "$INSTALL_CLI/"

# Remove legacy bao wrapper if present
if [ -f "${INSTALL_BIN}/bao" ] && grep -q "secret-store-bao-wrapper" "${INSTALL_BIN}/bao" 2>/dev/null; then
  echo "==> Removing legacy bao wrapper"
  rm -f "${INSTALL_BIN}/bao"
fi

echo "==> Installing wrapper to ${INSTALL_BIN}/vault..."
existing_vault="${INSTALL_BIN}/vault"
if [ -f "$existing_vault" ] && ! grep -q "$WRAPPER_MARKER" "$existing_vault" 2>/dev/null; then
  if [ ! -f "${INSTALL_BIN}/vault-real" ]; then
    echo "==> Preserving existing vault as ${INSTALL_BIN}/vault-real"
    mv "$existing_vault" "${INSTALL_BIN}/vault-real"
  else
    echo "WARNING: ${INSTALL_BIN}/vault-real already exists — leaving existing vault in place." >&2
    echo "         Set VAULT_REAL_BIN if the wrapper cannot find the real binary." >&2
  fi
fi

cp "${CLI_SRC}/bin/vault" "${INSTALL_BIN}/vault"
chmod +x "${INSTALL_BIN}/vault" "${INSTALL_CLI}/bin/vault"

if ! command -v vault-real >/dev/null 2>&1 \
  && ! command -v bao >/dev/null 2>&1 \
  && ! command -v openbao >/dev/null 2>&1 \
  && [ ! -x "${INSTALL_BIN}/vault-real" ]; then
  echo ""
  echo "WARNING: Vault/OpenBao binary not found on PATH." >&2
  echo "         Install before using vault run:" >&2
  echo "         https://openbao.org/docs/install/" >&2
fi

case ":${PATH}:" in
  *":${INSTALL_BIN}:"*) ;;
  *)
    echo ""
    echo "NOTE: ${INSTALL_BIN} is not on your PATH."
    echo "      Add to ~/.zshrc or ~/.bashrc:"
    echo "        export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    ;;
esac

echo ""
echo "================================================================================"
echo "Installed successfully"
echo "================================================================================"
echo ""
echo "Next steps:"
echo "  1. vault login hvs.your-root-token"
echo "     (or: ./scripts/create-dev-token.sh  for a scoped read token)"
echo ""
echo "  2. cd ~/your-app"
echo "     vault setup --project myapp --config dev"
echo ""
echo "  3. vault run -- bun myserver.tsx"
echo ""
echo "Verify:"
echo "  vault run --help"
echo "  vault kv list secret/"
