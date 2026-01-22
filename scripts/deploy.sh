#!/bin/bash
set -euo pipefail

# Deployment script for Digital Ocean
# This script copies files to the server and deploys the application

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (can be overridden by environment variables)
DO_HOST="${DO_HOST:-}"
DO_USER="${DO_USER:-root}"
DO_SSH_KEY="${DO_SSH_KEY:-}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/chrisvouga-dev}"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

# Function to print colored output
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check required variables
if [ -z "$DO_HOST" ]; then
    error "DO_HOST environment variable is required"
    exit 1
fi

# Set up SSH key if provided
if [ -n "$DO_SSH_KEY" ]; then
    SSH_OPTS="$SSH_OPTS -i $DO_SSH_KEY"
fi

info "Starting deployment to $DO_HOST..."

# Create temporary directory for files
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy necessary files to temp directory
info "Preparing deployment files..."
cp docker-compose.yml "$TEMP_DIR/"
cp Caddyfile "$TEMP_DIR/"

# Copy .env file if it exists
if [ -f .env ]; then
    cp .env "$TEMP_DIR/"
    info "Found .env file, will be deployed"
else
    warn ".env file not found. Make sure environment variables are set on the server."
fi

# Copy files to server
info "Copying files to server..."
scp $SSH_OPTS "$TEMP_DIR/docker-compose.yml" "$DO_USER@$DO_HOST:$DEPLOY_DIR/"
scp $SSH_OPTS "$TEMP_DIR/Caddyfile" "$DO_USER@$DO_HOST:$DEPLOY_DIR/"

if [ -f "$TEMP_DIR/.env" ]; then
    scp $SSH_OPTS "$TEMP_DIR/.env" "$DO_USER@$DO_HOST:$DEPLOY_DIR/"
fi

# Deploy on server
info "Deploying on server..."
ssh $SSH_OPTS "$DO_USER@$DO_HOST" <<EOF
set -euo pipefail
cd $DEPLOY_DIR

# Pull latest images
echo "Pulling latest images..."
docker compose pull

# Start/restart services
echo "Starting services..."
docker compose up -d --remove-orphans

# Wait a bit for services to start
sleep 10

# Check service status
echo "Service status:"
docker compose ps

# Health check
echo "Checking health..."
FAILED_SERVICES=\$(docker compose ps --format json | jq -r 'select(.State != "running") | .Name' || echo "")
if [ -n "\$FAILED_SERVICES" ]; then
    echo "Warning: Some services may not be running:"
    echo "\$FAILED_SERVICES"
    docker compose ps
    exit 1
fi

echo "Deployment complete!"
EOF

if [ $? -eq 0 ]; then
    info "Deployment successful!"
    info "Services are running at:"
    info "  - Main site: https://www.chrisvouga.dev"
    info "  - Check other services via their respective domains"
else
    error "Deployment failed!"
    exit 1
fi
