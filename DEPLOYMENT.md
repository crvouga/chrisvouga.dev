# Deployment Guide

This guide covers deploying the chrisvouga.dev application stack to Digital Ocean. **Everything is automated via GitHub Actions** - no local setup required!

## Prerequisites

- Digital Ocean account with API token
- GitHub repository with Actions enabled
- Domain names configured (or use IP addresses)

## Initial Setup (One-Time Configuration)

### 1. Configure GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions, and add the following secrets:

**Required Secrets:**
- `DO_TOKEN`: Your Digital Ocean API token (get from https://cloud.digitalocean.com/account/api/tokens)
- `DOCKER_USERNAME`: Docker Hub username
- `DOCKER_PASSWORD`: Docker Hub password/token
- `TMDB_API_READ_ACCESS_TOKEN`: The Movie Database API token
- `TWILIO_ACCOUNT_SID`: Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Twilio Auth Token
- `TWILIO_SERVICE_SID`: Twilio Service SID

**Optional Secrets (with defaults):**
- `DO_REGION`: Digital Ocean region (default: `nyc1`)
- `DO_DROPLET_SIZE`: Droplet size (default: `s-2vcpu-4gb`)
- `DO_ENABLE_RESERVED_IP`: Enable reserved IP (default: `true`)

See `GITHUB_SECRETS.md` for detailed instructions on obtaining these values.

### 2. Push to Main Branch

Simply push your code to the `main` branch:

```bash
git push origin main
```

GitHub Actions will automatically:
1. ✅ Run type checking
2. ✅ Run tests
3. ✅ Build and push Docker image
4. ✅ **Provision Digital Ocean infrastructure** (droplet, firewall, SSH keys)
5. ✅ **Setup server** (install Docker, configure firewall, etc.)
6. ✅ **Deploy application** (copy files, start services)
7. ✅ Verify deployment

### 3. Configure DNS

After the first deployment completes, get your droplet IP from the GitHub Actions workflow output:

1. Go to Actions → Latest workflow run
2. Click on the `infrastructure` job
3. Find the "Get Terraform Outputs" step
4. Copy the `droplet_ip` value

Point your domain names to this IP:

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

**Note:** Caddy will automatically provision SSL certificates once DNS is configured.

## Ongoing Deployments

### Automated Deployment (Default)

**Everything is automated!** Just push to `main`:

```bash
git push origin main
```

GitHub Actions automatically handles:
1. ✅ Type checking
2. ✅ Testing
3. ✅ Building Docker image
4. ✅ Pushing to Docker Hub
5. ✅ Infrastructure provisioning (if needed)
6. ✅ Server setup (if needed)
7. ✅ Deploying application
8. ✅ Health verification

### Manual Deployment (If Needed)

If you need to deploy manually (e.g., for troubleshooting):

```bash
# Get droplet IP from GitHub Actions output or Digital Ocean console
export DO_HOST=<your-droplet-ip>
export DO_USER=root

# Generate SSH key (must match the one in Digital Ocean)
# Or use the one from GitHub Actions artifacts

# Deploy
./scripts/deploy.sh
```

## Verifying Deployment

### Via GitHub Actions

The deployment workflow automatically verifies deployment. Check the workflow output:
1. Go to Actions → Latest workflow run
2. Check the `deploy` job
3. Look for "Verify deployment" step output

### Via Web Browser

Visit your domains:
- https://www.chrisvouga.dev
- https://pickflix.chrisvouga.dev
- https://headlesscombobox.chrisvouga.dev
- etc.

### Via SSH (If Needed)

To SSH into the server, you'll need the SSH key from GitHub Actions artifacts:

1. Download SSH key from the `infrastructure` job artifacts
2. Use it to connect:

```bash
# Get droplet IP from GitHub Actions output
DROPLET_IP=<from-github-actions-output>

# SSH into server
ssh -i ~/.ssh/do_deploy_key root@$DROPLET_IP

# Check service status
cd /opt/chrisvouga-dev && docker compose ps

# Check logs
docker compose logs
```

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
