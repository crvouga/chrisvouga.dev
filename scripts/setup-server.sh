#!/bin/bash
set -euo pipefail

# Setup script for Digital Ocean droplet
# This script should be run once on a fresh droplet to set up Docker and Docker Compose

echo "Starting server setup..."

# Update system packages
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y

# Install required packages
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    wget \
    git

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Install Docker Compose (standalone, for compatibility)
if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    DOCKER_COMPOSE_VERSION="v2.24.0"
    curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Add current user to docker group (if not root)
if [ "$EUID" -ne 0 ]; then
    usermod -aG docker "$USER"
else
    # If running as root, create a deployment user
    if ! id -u deploy &>/dev/null; then
        echo "Creating deploy user..."
        useradd -m -s /bin/bash deploy
        usermod -aG docker deploy
        usermod -aG sudo deploy
        echo "deploy ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
    fi
fi

# Create deployment directory
DEPLOY_DIR="/opt/chrisvouga-dev"
mkdir -p "$DEPLOY_DIR"
chmod 755 "$DEPLOY_DIR"

# Create systemd service for auto-restart
cat > /etc/systemd/system/chrisvouga-dev.service <<EOF
[Unit]
Description=Chris Vouga Dev Stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOY_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable but don't start the service (will be started after first deployment)
systemctl daemon-reload
systemctl enable chrisvouga-dev.service

# Configure firewall (ufw)
if command -v ufw &> /dev/null; then
    echo "Configuring firewall..."
    ufw --force enable
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 443/udp
fi

# Verify installations
echo "Verifying installations..."
docker --version
docker compose version || docker-compose --version

echo "Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy your docker-compose.yml and Caddyfile to $DEPLOY_DIR"
echo "2. Copy your .env file with environment variables"
echo "3. Run: docker compose up -d"
echo ""
echo "Or use the deploy.sh script for automated deployment."
