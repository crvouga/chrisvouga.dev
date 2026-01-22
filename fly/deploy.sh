#!/bin/bash
set -e

# Service configuration mapping: app_dir -> (app_name, subdomain, secrets)
# Secrets format: comma-separated list of secret names (or "none")
declare -A SERVICES=(
  ["portfolio"]="crvouga-portfolio www none"
  ["pickflix"]="crvouga-pickflix pickflix TMDB_API_READ_ACCESS_TOKEN"
  ["headless-combobox-docs"]="crvouga-headless-combobox-docs headless-combobox-docs none"
  ["headless-combobox-svelte-example"]="crvouga-headless-combobox-svelte-example headless-combobox-svelte none"
  ["moviefinder-app-rust"]="crvouga-moviefinder-app-rust moviefinder-rust TMDB_API_READ_ACCESS_TOKEN,TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN,TWILIO_SERVICE_SID"
  ["moviefinder-app-go"]="crvouga-moviefinder-app-go moviefinder-go TMDB_API_READ_ACCESS_TOKEN,TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN,TWILIO_SERVICE_SID"
  ["moviefinder-app-react"]="crvouga-moviefinder-app-react moviefinder-react TMDB_API_READ_ACCESS_TOKEN,TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN,TWILIO_SERVICE_SID"
  ["moviefinder-app-clojurescript"]="crvouga-moviefinder-app-clojurescript moviefinder-cljs TMDB_API_READ_ACCESS_TOKEN,TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN,TWILIO_SERVICE_SID"
  ["todo-app"]="crvouga-todo-app todo none"
  ["image-service"]="crvouga-image-service image-service none"
  ["connect-four"]="crvouga-connect-four connect-four none"
  ["screenshot-service"]="crvouga-screenshot-service screenshot-service none"
  ["anime-blog"]="crvouga-anime-blog anime none"
  ["snake-game"]="crvouga-snake-game snake none"
  ["match-three"]="crvouga-match-three match-three none"
  ["simon-says"]="crvouga-simon-says simon-says none"
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
  IFS=' ' read -r app_name subdomain secrets_list <<< "${SERVICES[$app_folder]}"
  
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
  if [ "${secrets_list}" != "none" ]; then
    echo "Setting secrets..."
    
    # Build secrets array from comma-separated list
    SECRETS=()
    IFS=',' read -ra SECRET_NAMES <<< "${secrets_list}"
    
    for secret_name in "${SECRET_NAMES[@]}"; do
      # Get the value of the environment variable with this name
      secret_value="${!secret_name}"
      
      if [ -n "${secret_value}" ]; then
        SECRETS+=("${secret_name}=${secret_value}")
      else
        echo "Warning: Secret ${secret_name} not found in environment"
      fi
    done
    
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
