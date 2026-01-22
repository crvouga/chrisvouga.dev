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

# Allocate shared IPv4 on first app (portfolio)
FIRST_APP="crvouga-portfolio"
echo "Allocating shared IPv4 address (if needed)..."
fly ips allocate-v4 --shared -a "${FIRST_APP}" || true

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
  echo "Creating app (if needed)..."
  fly apps create "${app_name}" --org personal || true

  # Allocate shared IPv4 to this app
  echo "Allocating shared IPv4..."
  fly ips allocate-v4 --shared -a "${app_name}" || true

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
    
    # Set secrets if we have any
    if [ ${#SECRETS[@]} -gt 0 ]; then
      fly secrets set "${SECRETS[@]}" -a "${app_name}"
    fi
  fi

  # Deploy the app
  echo "Deploying app..."
  fly deploy --config "${app_dir}/fly.toml" -a "${app_name}" --yes

  # Add custom domain certificate (configures Fly's edge routing)
  echo "Adding custom domain certificate..."
  fly certs add "${subdomain}.chrisvouga.dev" -a "${app_name}" || true
  
  # Also add www for portfolio
  if [ "${app_name}" == "crvouga-portfolio" ]; then
    echo "Adding www certificate for portfolio..."
    fly certs add "www.chrisvouga.dev" -a "${app_name}" || true
    echo "Adding apex domain certificate for portfolio..."
    fly certs add "chrisvouga.dev" -a "${app_name}" || true
  fi

  echo "✓ Completed: ${app_name}"
done

echo ""
echo "=========================================="
echo "All deployments completed!"
echo "=========================================="
