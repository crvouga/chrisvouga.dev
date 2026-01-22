#!/bin/bash
set -e

# Service configuration mapping: app_dir -> (app_name, subdomain, needs_secrets)
declare -A SERVICES=(
  ["portfolio"]="crvouga-portfolio www false"
  ["pickflix"]="crvouga-pickflix pickflix true"
  ["headless-combobox-docs"]="crvouga-headless-combobox-docs headless-combobox-docs false"
  ["headless-combobox-svelte-example"]="crvouga-headless-combobox-svelte-example headless-combobox-svelte false"
  ["moviefinder-app-rust"]="crvouga-moviefinder-app-rust moviefinder-rust true"
  ["moviefinder-app-go"]="crvouga-moviefinder-app-go moviefinder-go true"
  ["moviefinder-app-react"]="crvouga-moviefinder-app-react moviefinder-react true"
  ["moviefinder-app-clojurescript"]="crvouga-moviefinder-app-clojurescript moviefinder-cljs true"
  ["todo-app"]="crvouga-todo-app todo false"
  ["image-service"]="crvouga-image-service image-service false"
  ["connect-four"]="crvouga-connect-four connect-four false"
  ["screenshot-service"]="crvouga-screenshot-service screenshot-service false"
  ["anime-blog"]="crvouga-anime-blog anime false"
  ["snake-game"]="crvouga-snake-game snake false"
  ["match-three"]="crvouga-match-three match-three false"
  ["simon-says"]="crvouga-simon-says simon-says false"
)

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS_DIR="${SCRIPT_DIR}/apps"

# Helper function to check if app exists
app_exists() {
  local app_name=$1
  flyctl apps list 2>/dev/null | grep -q "^${app_name}[[:space:]]"
}

# Helper function to check if app has IPv4
has_ipv4() {
  local app_name=$1
  flyctl ips list -a "${app_name}" 2>/dev/null | grep -q "v4"
}

# Helper function to check if cert exists
cert_exists() {
  local domain=$1
  local app_name=$2
  flyctl certs list -a "${app_name}" 2>/dev/null | grep -q "${domain}"
}

# Allocate shared IPv4 on first app (portfolio) if it exists
FIRST_APP="crvouga-portfolio"
echo "Checking IPv4 for ${FIRST_APP}..."
if app_exists "${FIRST_APP}"; then
  if has_ipv4 "${FIRST_APP}"; then
    echo "✓ IPv4 already allocated for ${FIRST_APP}"
  else
    echo "Allocating shared IPv4 for ${FIRST_APP}..."
    flyctl ips allocate-v4 --shared -a "${FIRST_APP}" 2>/dev/null || echo "Note: IPv4 allocation skipped or already exists"
  fi
else
  echo "Note: ${FIRST_APP} doesn't exist yet, will allocate IPv4 during deployment"
fi

# Iterate through each app directory
for app_dir in "${APPS_DIR}"/*; do
  if [ ! -d "${app_dir}" ]; then
    continue
  fi

  app_folder=$(basename "${app_dir}")
  
  # Skip if not in our services map
  if [ -z "${SERVICES[$app_folder]}" ]; then
    echo "Skipping ${app_folder} (not in services map)"
    continue
  fi

  # Parse service config
  IFS=' ' read -r app_name subdomain needs_secrets <<< "${SERVICES[$app_folder]}"
  
  echo ""
  echo "=========================================="
  echo "Deploying: ${app_name}"
  echo "Subdomain: ${subdomain}.chrisvouga.dev"
  echo "=========================================="

  # Create app if it doesn't exist
  if app_exists "${app_name}"; then
    echo "✓ App ${app_name} already exists"
  else
    echo "Creating app ${app_name}..."
    flyctl apps create "${app_name}" --org personal
  fi

  # Allocate shared IPv4 to this app (only if app exists)
  if app_exists "${app_name}"; then
    if has_ipv4 "${app_name}"; then
      echo "✓ IPv4 already allocated for ${app_name}"
    else
      echo "Allocating shared IPv4 for ${app_name}..."
      flyctl ips allocate-v4 --shared -a "${app_name}" 2>/dev/null || echo "Note: IPv4 allocation skipped or already exists"
    fi
  fi

  # Set secrets if needed
  if [ "${needs_secrets}" = "true" ]; then
    echo "Setting secrets..."
    
    # Build secrets array
    SECRETS=()
    
    # All moviefinder apps need TMDB and Twilio secrets
    if [[ "${app_name}" == *"moviefinder"* ]] || [[ "${app_name}" == "crvouga-pickflix" ]]; then
      if [ -n "${TMDB_API_READ_ACCESS_TOKEN}" ]; then
        SECRETS+=("TMDB_API_READ_ACCESS_TOKEN=${TMDB_API_READ_ACCESS_TOKEN}")
      fi
    fi
    
    # Moviefinder apps also need Twilio secrets
    if [[ "${app_name}" == *"moviefinder"* ]]; then
      if [ -n "${TWILIO_ACCOUNT_SID}" ]; then
        SECRETS+=("TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}")
      fi
      if [ -n "${TWILIO_AUTH_TOKEN}" ]; then
        SECRETS+=("TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}")
      fi
      if [ -n "${TWILIO_SERVICE_SID}" ]; then
        SECRETS+=("TWILIO_SERVICE_SID=${TWILIO_SERVICE_SID}")
      fi
    fi
    
    # Pickflix only needs TMDB
    if [ "${app_name}" == "crvouga-pickflix" ]; then
      # Already added TMDB above
      :
    fi
    
    # Set secrets if we have any (this updates existing or creates new)
    if [ ${#SECRETS[@]} -gt 0 ]; then
      flyctl secrets set "${SECRETS[@]}" -a "${app_name}" 2>/dev/null || echo "Note: Secrets may already be set"
    fi
  fi

  # Deploy the app
  echo "Deploying app..."
  flyctl deploy --config "${app_dir}/fly.toml" -a "${app_name}" --ha=false --yes

  # Add custom domain certificate (configures Fly's edge routing)
  DOMAIN="${subdomain}.chrisvouga.dev"
  if cert_exists "${DOMAIN}" "${app_name}"; then
    echo "✓ Certificate for ${DOMAIN} already exists"
  else
    echo "Adding certificate for ${DOMAIN}..."
    flyctl certs add "${DOMAIN}" -a "${app_name}" 2>/dev/null || echo "Note: Certificate already exists or failed to add"
  fi
  
  # Also add www for portfolio
  if [ "${app_name}" == "crvouga-portfolio" ]; then
    WWW_DOMAIN="www.chrisvouga.dev"
    if cert_exists "${WWW_DOMAIN}" "${app_name}"; then
      echo "✓ Certificate for ${WWW_DOMAIN} already exists"
    else
      echo "Adding www certificate for portfolio..."
      flyctl certs add "${WWW_DOMAIN}" -a "${app_name}" 2>/dev/null || echo "Note: Certificate already exists or failed to add"
    fi
    
    APEX_DOMAIN="chrisvouga.dev"
    if cert_exists "${APEX_DOMAIN}" "${app_name}"; then
      echo "✓ Certificate for ${APEX_DOMAIN} already exists"
    else
      echo "Adding apex domain certificate for portfolio..."
      flyctl certs add "${APEX_DOMAIN}" -a "${app_name}" 2>/dev/null || echo "Note: Certificate already exists or failed to add"
    fi
  fi

  echo "✓ Completed: ${app_name}"
done

echo ""
echo "=========================================="
echo "All deployments completed!"
echo "=========================================="
