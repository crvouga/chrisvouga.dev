#!/bin/bash
set -e

# Service configuration mapping: app_dir -> app_name
# This should match the apps defined in deploy.sh
declare -A APPS=(
  ["portfolio"]="crvouga-portfolio"
  ["pickflix"]="crvouga-pickflix"
  ["headless-combobox-docs"]="crvouga-headless-combobox-docs"
  ["headless-combobox-svelte-example"]="crvouga-headless-combobox-svelte-example"
  ["moviefinder-app-rust"]="crvouga-moviefinder-app-rust"
  ["moviefinder-app-go"]="crvouga-moviefinder-app-go"
  ["moviefinder-app-react"]="crvouga-moviefinder-app-react"
  ["moviefinder-app-clojurescript"]="crvouga-moviefinder-app-clojurescript"
  ["todo-app"]="crvouga-todo-app"
  ["image-service"]="crvouga-image-service"
  ["connect-four"]="crvouga-connect-four"
  ["screenshot-service"]="crvouga-screenshot-service"
  ["anime-blog"]="crvouga-anime-blog"
  ["snake-game"]="crvouga-snake-game"
  ["match-three"]="crvouga-match-three"
  ["simon-says"]="crvouga-simon-says"
)

# Helper function to check if app exists
app_exists() {
  local app_name=$1
  flyctl apps list 2>/dev/null | grep -q "^${app_name}[[:space:]]"
}

echo "=========================================="
echo "Fly.io Cleanup - Removing All Apps"
echo "=========================================="
echo ""

# Iterate through each app and delete if it exists
for app_dir in "${!APPS[@]}"; do
  app_name="${APPS[$app_dir]}"
  
  if app_exists "${app_name}"; then
    echo "Removing app: ${app_name}..."
    flyctl apps destroy "${app_name}" --yes 2>/dev/null || echo "Warning: Failed to remove ${app_name}"
    echo "✓ Removed: ${app_name}"
  else
    echo "✓ App ${app_name} does not exist (already removed or never created)"
  fi
done

echo ""
echo "=========================================="
echo "Cleanup completed!"
echo "All Fly.io apps have been removed."
echo "=========================================="
