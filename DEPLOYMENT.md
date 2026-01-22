# Deployment Guide

This guide covers deploying the chrisvouga.dev application stack to Digital Ocean.

## Prerequisites

- Digital Ocean account with API token
- Terraform installed (>= 1.5.0)
- SSH key pair
- GitHub repository with Actions enabled
- Domain names configured (or use IP addresses)

## Initial Infrastructure Setup

### 1. Configure Terraform

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:
- `do_token`: Your Digital Ocean API token
- `ssh_public_key_path`: Path to your public SSH key
- Adjust other settings as needed

### 2. Provision Infrastructure

```bash
cd infrastructure
terraform init
terraform plan
terraform apply
```

After applying, note the output values:
- `droplet_ip`: IP address of your droplet
- `reserved_ip`: Reserved IP (if enabled)

### 3. Configure DNS

Point your domain names to the droplet IP:

- `www.chrisvouga.dev` → Droplet IP
- `pickflix.chrisvouga.dev` → Droplet IP
- `headlesscombobox.chrisvouga.dev` → Droplet IP
- `svelte.headlesscombobox.chrisvouga.dev` → Droplet IP
- `moviefinder-app-rust.chrisvouga.dev` → Droplet IP
- `moviefinder-app-go.chrisvouga.dev` → Droplet IP
- `moviefinder-app-react.chrisvouga.dev` → Droplet IP
- `moviefinder-app-clojurescript.chrisvouga.dev` → Droplet IP
- `todo.chrisvouga.dev` → Droplet IP
- `imageservice.chrisvouga.dev` → Droplet IP
- `connectfour.chrisvouga.dev` → Droplet IP
- `screenshotservice.chrisvouga.dev` → Droplet IP
- `anime.chrisvouga.dev` → Droplet IP
- `snake.chrisvouga.dev` → Droplet IP
- `matchthree.chrisvouga.dev` → Droplet IP
- `simonsays.chrisvouga.dev` → Droplet IP

### 4. Initial Server Setup

SSH into your droplet and run the setup script:

```bash
# Get droplet IP from Terraform output
cd infrastructure
DROPLET_IP=$(terraform output -raw droplet_ip)

# Copy setup script to server
scp scripts/setup-server.sh root@$DROPLET_IP:/tmp/

# SSH into server
ssh root@$DROPLET_IP

# Run setup script
chmod +x /tmp/setup-server.sh
/tmp/setup-server.sh
```

The setup script will:
- Install Docker and Docker Compose
- Configure firewall
- Create deployment directory
- Set up systemd service for auto-restart

### 5. Configure Environment Variables

Create `.env` file on the server:

```bash
# SSH into server
ssh root@$DROPLET_IP

# Create .env file
cd /opt/chrisvouga-dev
nano .env
```

Add your environment variables (see `env.example` for template):
```
TMDB_API_READ_ACCESS_TOKEN=your_token_here
TWILIO_ACCOUNT_SID=your_sid_here
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_SERVICE_SID=your_service_sid_here
```

### 6. First Deployment

#### Manual Deployment

```bash
# Set environment variables
export DO_HOST=$(cd infrastructure && terraform output -raw droplet_ip)
export DO_USER=root

# Deploy
./scripts/deploy.sh
```

#### Automated Deployment via GitHub Actions

1. Configure GitHub Secrets (see `GITHUB_SECRETS.md`):
   - `DO_HOST`: Droplet IP address
   - `DO_USER`: SSH user (default: `root`)
   - `DO_SSH_KEY`: Private SSH key
   - `TMDB_API_READ_ACCESS_TOKEN`: TMDB API token
   - `TWILIO_ACCOUNT_SID`: Twilio Account SID
   - `TWILIO_AUTH_TOKEN`: Twilio Auth Token
   - `TWILIO_SERVICE_SID`: Twilio Service SID

2. Push to `main` branch - GitHub Actions will automatically deploy

## Ongoing Deployments

### Automated (Recommended)

Push to `main` branch - GitHub Actions handles everything:
1. Type checking
2. Testing
3. Building Docker image
4. Pushing to Docker Hub
5. Deploying to Digital Ocean

### Manual Deployment

```bash
export DO_HOST=<your-droplet-ip>
export DO_USER=root
./scripts/deploy.sh
```

## Verifying Deployment

### Check Service Status

```bash
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose ps"
```

### Check Logs

```bash
# All services
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose logs"

# Specific service
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose logs portfolio"
```

### Health Checks

Visit your domains:
- https://www.chrisvouga.dev
- https://pickflix.chrisvouga.dev
- etc.

## Troubleshooting

### Services Not Starting

```bash
# Check logs
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose logs"

# Check service status
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose ps"

# Restart services
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose restart"
```

### Caddy Not Starting

```bash
# Check Caddy logs
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose logs caddy"

# Verify Caddyfile syntax
ssh root@$DROPLET_IP "docker run --rm -v /opt/chrisvouga-dev/Caddyfile:/etc/caddy/Caddyfile:ro caddy:latest caddy validate --config /etc/caddy/Caddyfile"
```

### SSL Certificate Issues

Caddy automatically provisions SSL certificates. If there are issues:
1. Check DNS records are pointing to the droplet
2. Wait a few minutes for DNS propagation
3. Check Caddy logs for certificate errors

### Database Connection Issues

For services with PostgreSQL dependencies:
```bash
# Check database status
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose ps | grep postgres"

# Check database logs
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose logs moviefinder-app-rust-postgres"
```

## Updating Services

### Update Single Service

```bash
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose pull portfolio && docker compose up -d portfolio"
```

### Update All Services

```bash
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose pull && docker compose up -d"
```

Or use the deployment script:
```bash
./scripts/deploy.sh
```

## Monitoring

### System Resources

```bash
# Check disk usage
ssh root@$DROPLET_IP "df -h"

# Check memory usage
ssh root@$DROPLET_IP "free -h"

# Check Docker resource usage
ssh root@$DROPLET_IP "docker stats --no-stream"
```

### Service Health

All services have health checks configured. Check status:
```bash
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose ps"
```

## Backup and Recovery

### Backup Docker Volumes

```bash
# Backup PostgreSQL databases
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose exec -T moviefinder-app-rust-postgres pg_dump -U moviefinder-app-rust-postgres moviefinder-app-rust-postgres > backup-rust-$(date +%Y%m%d).sql"
```

### Restore from Backup

```bash
# Restore PostgreSQL database
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose exec -T moviefinder-app-rust-postgres psql -U moviefinder-app-rust-postgres moviefinder-app-rust-postgres < backup-rust-YYYYMMDD.sql"
```

## Scaling

This setup is designed for a single-node deployment. For scaling:

1. **Vertical Scaling**: Increase droplet size via Terraform
2. **Horizontal Scaling**: Consider Digital Ocean App Platform or Kubernetes
3. **Database Scaling**: Migrate to Digital Ocean Managed Databases

## Security

- SSH keys are used for authentication (no passwords)
- Firewall restricts access to ports 22, 80, 443
- Caddy handles SSL/TLS automatically
- Environment variables stored securely (not in git)
- Regular security updates via `apt-get upgrade`

## Maintenance

### Update System Packages

```bash
ssh root@$DROPLET_IP "apt-get update && apt-get upgrade -y"
```

### Update Docker Images

```bash
ssh root@$DROPLET_IP "cd /opt/chrisvouga-dev && docker compose pull && docker compose up -d"
```

### Clean Up Unused Docker Resources

```bash
ssh root@$DROPLET_IP "docker system prune -a --volumes"
```
