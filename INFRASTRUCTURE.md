# Infrastructure as Code Guide

This guide covers managing infrastructure using Terraform for Digital Ocean.

## Overview

All infrastructure is defined as code using Terraform. This includes:
- Digital Ocean Droplet (compute instance)
- Firewall rules
- SSH key management
- Reserved IP (optional)

## Prerequisites

- Terraform >= 1.5.0 installed
- Digital Ocean API token
- SSH key pair

## Installation

### Install Terraform

**macOS:**
```bash
brew install terraform
```

**Linux:**
```bash
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/
```

**Windows:**
Download from https://www.terraform.io/downloads

### Get Digital Ocean API Token

1. Go to https://cloud.digitalocean.com/account/api/tokens
2. Click "Generate New Token"
3. Give it a name (e.g., "terraform")
4. Select "Write" scope
5. Copy the token (you won't see it again!)

## Configuration

### 1. Configure Terraform Variables

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
do_token = "your-digital-ocean-api-token-here"
ssh_key_name = "chrisvouga-dev-key"
ssh_public_key_path = "~/.ssh/id_rsa.pub"
droplet_name = "chrisvouga-dev"
droplet_region = "nyc1"
droplet_size = "s-2vcpu-4gb"
droplet_image = "ubuntu-22-04-x64"
enable_reserved_ip = true
tags = ["chrisvouga-dev", "production"]
```

### 2. Generate SSH Key (if needed)

```bash
ssh-keygen -t ed25519 -C "chrisvouga-dev" -f ~/.ssh/chrisvouga_dev_key
```

Update `terraform.tfvars`:
```hcl
ssh_public_key_path = "~/.ssh/chrisvouga_dev_key.pub"
```

## Usage

### Initialize Terraform

```bash
cd infrastructure
terraform init
```

This downloads the Digital Ocean provider.

### Plan Changes

```bash
terraform plan
```

Review the planned changes before applying.

### Apply Changes

```bash
terraform apply
```

Type `yes` to confirm. This will:
- Upload SSH key to Digital Ocean
- Create firewall
- Create droplet
- Assign reserved IP (if enabled)
- Attach firewall to droplet

### View Outputs

```bash
terraform output
```

Get specific output:
```bash
terraform output droplet_ip
terraform output reserved_ip
terraform output ssh_connection_command
```

### Destroy Infrastructure

**Warning:** This will delete everything!

```bash
terraform destroy
```

## Infrastructure Components

### Droplet

- **Image**: Ubuntu 22.04 LTS
- **Size**: s-2vcpu-4gb (2 vCPUs, 4GB RAM, 80GB SSD)
- **Region**: Configurable (default: nyc1)
- **Tags**: For organization and filtering

### Firewall

Allows inbound traffic on:
- Port 22 (SSH)
- Port 80 (HTTP)
- Port 443 (HTTPS/TLS)

Allows all outbound traffic.

### SSH Key

Automatically uploaded to Digital Ocean and added to the droplet.

### Reserved IP (Optional)

Provides a static IP address that persists even if the droplet is destroyed and recreated.

## Managing Infrastructure

### Update Droplet Size

1. Edit `terraform.tfvars`:
   ```hcl
   droplet_size = "s-4vcpu-8gb"  # Upgrade to 4 vCPUs, 8GB RAM
   ```

2. Apply changes:
   ```bash
   terraform apply
   ```

**Note:** This will recreate the droplet. Backup data first!

### Change Region

1. Edit `terraform.tfvars`:
   ```hcl
   droplet_region = "sfo3"  # San Francisco
   ```

2. Apply changes:
   ```bash
   terraform apply
   ```

**Warning:** This will recreate the droplet in the new region!

### Add/Remove Firewall Rules

Edit `infrastructure/main.tf`:

```hcl
resource "digitalocean_firewall" "main" {
  # ... existing rules ...

  inbound_rule {
    protocol         = "tcp"
    port_range       = "8080"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
}
```

Apply:
```bash
terraform apply
```

### Enable/Disable Reserved IP

Edit `terraform.tfvars`:
```hcl
enable_reserved_ip = false  # or true
```

Apply:
```bash
terraform apply
```

## Using Digital Ocean CLI (doctl)

### Install doctl

**macOS:**
```bash
brew install doctl
```

**Linux:**
```bash
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.100.0/doctl-1.100.0-linux-amd64.tar.gz
tar xf doctl-1.100.0-linux-amd64.tar.gz
sudo mv doctl /usr/local/bin
```

### Authenticate

```bash
doctl auth init
# Enter your Digital Ocean API token
```

### Useful Commands

```bash
# List droplets
doctl compute droplet list

# Get droplet details
doctl compute droplet get <DROPLET_ID>

# List SSH keys
doctl compute ssh-key list

# List firewalls
doctl compute firewall list

# Get firewall details
doctl compute firewall get <FIREWALL_ID>

# Get reserved IPs
doctl compute reserved-ip list
```

## Best Practices

### 1. Version Control

- Commit Terraform files to git
- **Never** commit `terraform.tfvars` (contains secrets)
- Use `terraform.tfvars.example` as template

### 2. State Management

- Terraform state is stored locally in `terraform.tfstate`
- Consider using remote state (S3, Terraform Cloud) for team collaboration
- Backup state files regularly

### 3. Resource Naming

- Use consistent naming conventions
- Include environment tags (production, staging)
- Use descriptive names

### 4. Cost Management

- Monitor droplet usage
- Use appropriate droplet sizes
- Consider reserved IP costs ($0.006/hour)
- Set up billing alerts in Digital Ocean

### 5. Security

- Rotate API tokens regularly
- Use SSH keys, not passwords
- Restrict firewall rules to necessary IPs
- Keep Terraform and providers updated

## Troubleshooting

### Terraform State Locked

If Terraform crashes, state might be locked:

```bash
terraform force-unlock <LOCK_ID>
```

### Provider Authentication Error

```bash
# Verify token is correct
doctl auth init

# Check token in terraform.tfvars
cat infrastructure/terraform.tfvars | grep do_token
```

### SSH Key Already Exists

If SSH key name conflicts:

1. Change `ssh_key_name` in `terraform.tfvars`
2. Or delete existing key in Digital Ocean console
3. Re-run `terraform apply`

### Droplet Creation Fails

- Check API token has write permissions
- Verify region/size availability
- Check account limits/billing

## Remote State (Optional)

For team collaboration, use remote state:

### Terraform Cloud

```hcl
terraform {
  cloud {
    organization = "your-org"
    workspaces {
      name = "chrisvouga-dev"
    }
  }
}
```

### S3 Backend

```hcl
terraform {
  backend "s3" {
    bucket = "your-terraform-state-bucket"
    key    = "chrisvouga-dev/terraform.tfstate"
    region = "us-east-1"
  }
}
```

## Cost Estimation

Approximate monthly costs:

- Droplet (s-2vcpu-4gb): ~$24/month
- Reserved IP: ~$4.32/month (if enabled)
- **Total**: ~$28/month

Check current pricing: https://www.digitalocean.com/pricing

## Next Steps

After infrastructure is provisioned:

1. Run server setup script (see `DEPLOYMENT.md`)
2. Configure DNS records
3. Deploy application
4. Set up monitoring and backups
