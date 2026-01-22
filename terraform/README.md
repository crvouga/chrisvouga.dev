# Fly.io Infrastructure as Code

This directory contains Terraform configuration for managing all Fly.io applications and machines.

## Overview

This Terraform configuration deploys 16 services from `projects.json` to Fly.io with:
- One Fly.io app per service
- Auto-scaling configuration (scale-to-zero enabled)
- Environment variables and secrets management via Terraform Cloud
- Automated deployments via GitHub Actions

## Prerequisites

1. **Terraform Cloud Account**
   - Organization: `crvouga`
   - Workspace: `portfolio`

2. **Fly.io Account**
   - API token for authentication

3. **GitHub Secrets**
   - `TF_API_TOKEN` - Terraform Cloud API token

## Terraform Cloud Setup

### 1. Create Workspace

1. Log in to [Terraform Cloud](https://app.terraform.io)
2. Navigate to organization `crvouga`
3. Create a new workspace named `portfolio`
4. Choose "API-driven workflow" as the execution mode

### 2. Configure Variables

Add the following variables in Terraform Cloud workspace settings. **Mark all as Sensitive:**

| Variable Name | Description | Example |
|--------------|-------------|---------|
| `fly_api_token` | Fly.io API token | Get from `fly auth token` |
| `tmdb_api_read_access_token` | TMDB API read access token | Your TMDB API key |
| `twilio_account_sid` | Twilio account SID | Your Twilio account SID |
| `twilio_auth_token` | Twilio authentication token | Your Twilio auth token |
| `twilio_service_sid` | Twilio service SID | Your Twilio service SID |

### 3. Get Fly.io API Token

```bash
fly auth token
```

Copy the token and add it to Terraform Cloud as `fly_api_token`.

### 4. Get Terraform Cloud API Token

1. Go to [Terraform Cloud User Settings](https://app.terraform.io/app/settings/tokens)
2. Create a new API token
3. Add it to GitHub Secrets as `TF_API_TOKEN`

## Local Development

### Initialize Terraform

```bash
cd terraform
terraform init
```

### Plan Changes

```bash
terraform plan
```

### Apply Changes

```bash
terraform apply
```

## GitHub Actions Workflow

The workflow (`.github/workflows/terraform.yml`) automatically:

- **On Pull Request:**
  - Runs `terraform fmt -check`
  - Runs `terraform validate`
  - Runs `terraform plan` (for review)

- **On Push to Main:**
  - Runs all checks above
  - Runs `terraform apply -auto-approve` to deploy changes

## DNS Configuration

After the first successful deployment, Terraform will output the shared IP addresses:

```bash
terraform output shared_ipv4
terraform output shared_ipv6
terraform output dns_instructions
```

Configure DNS records in your domain provider:

- `@ A {shared_ipv4}` - Apex domain
- `* A {shared_ipv4}` - Wildcard subdomain
- `@ AAAA {shared_ipv6}` - Apex domain (IPv6)
- `* AAAA {shared_ipv6}` - Wildcard subdomain (IPv6)

## Service URLs

After deployment, services will be available at:

- `https://portfolio.chrisvouga.dev`
- `https://pickflix.chrisvouga.dev`
- `https://headless-combobox-docs.chrisvouga.dev`
- `https://headless-combobox-svelte-example.chrisvouga.dev`
- `https://moviefinder-app-rust.chrisvouga.dev`
- `https://moviefinder-app-go.chrisvouga.dev`
- `https://moviefinder-app-react.chrisvouga.dev`
- `https://moviefinder-app-clojurescript.chrisvouga.dev`
- `https://todo-app.chrisvouga.dev`
- `https://image-service.chrisvouga.dev`
- `https://connect-four.chrisvouga.dev`
- `https://screenshot-service.chrisvouga.dev`
- `https://anime-blog.chrisvouga.dev`
- `https://snake-game.chrisvouga.dev`
- `https://match-three.chrisvouga.dev`
- `https://simon-says.chrisvouga.dev`

## Fly.io Configuration

Each service is configured with:

- **Region:** `iad` (US East - Ashburn, VA)
- **VM Size:** `shared-cpu-1x` (1 shared vCPU, 256MB RAM)
- **Scaling:** Min 0, Max 1 machines (scale-to-zero enabled)
- **Auto-destroy:** `false` (machines persist when stopped)

## Cost Estimation

With scale-to-zero enabled:
- **Idle cost:** $0/month (all machines stopped when not in use)
- **Active cost:** ~$0.0001/second per machine when running
- **Estimated monthly:** $5-20 depending on traffic

## Troubleshooting

### Terraform Cloud Authentication

If you see authentication errors:
1. Verify `TF_API_TOKEN` is set in GitHub Secrets
2. Verify the token has access to the `crvouga` organization
3. Check workspace permissions

### Fly.io Provider Issues

If the Fly.io provider fails:
1. Verify `fly_api_token` is set correctly in Terraform Cloud
2. Ensure you have a valid Fly.io account
3. Check Fly.io API status

### Machine Creation Failures

If machines fail to create:
1. Verify Docker images exist and are accessible
2. Check Fly.io region availability
3. Review machine resource limits

## Migration Strategy

1. Deploy all services to Fly.io (parallel with existing Docker setup)
2. Test each service URL
3. Update DNS to point to Fly.io IP
4. Monitor for 24-48 hours
5. Decommission Docker Compose infrastructure

## Files

- `terraform.tf` - Backend and provider configuration
- `variables.tf` - Variable definitions
- `main.tf` - Fly.io app, machine, and scaling resources
- `outputs.tf` - DNS and service URL outputs
- `../projects.json` - Service definitions (source of truth)
