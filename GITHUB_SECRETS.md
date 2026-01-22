# GitHub Secrets Configuration Guide

This guide explains how to obtain and configure the required GitHub Secrets for deployment.

## Required GitHub Secrets

### 1. DO_HOST (Required)
**What it is:** The IP address of your Digital Ocean droplet

**How to get it:**

**Option A: From Terraform (after provisioning)**
```bash
cd infrastructure
terraform output droplet_ip
```

**Option B: Using Digital Ocean CLI (doctl)**
```bash
# Install doctl if you haven't: https://docs.digitalocean.com/reference/doctl/how-to/install/
doctl auth init  # Authenticate with your DO token

# List droplets and get IP
doctl compute droplet list --format ID,Name,PublicIPv4

# Or get specific droplet by name
doctl compute droplet list --format Name,PublicIPv4 --no-header | grep chrisvouga-dev
```

**Option C: From Digital Ocean Web Console**
1. Go to https://cloud.digitalocean.com/droplets
2. Click on your droplet
3. Copy the IPv4 address

**Set in GitHub:**
- Go to your repository → Settings → Secrets and variables → Actions
- Click "New repository secret"
- Name: `DO_HOST`
- Value: Your droplet IP (e.g., `123.45.67.89`)

---

### 2. DO_USER (Optional - defaults to 'root')
**What it is:** SSH username for connecting to the droplet

**Default value:** `root` (standard for Digital Ocean droplets)

**How to get it:**
- For standard Digital Ocean droplets, use `root`
- If you created a custom user, use that username

**Set in GitHub:**
- Name: `DO_USER`
- Value: `root` (or your custom user)

---

### 3. DO_SSH_KEY (Required)
**What it is:** Private SSH key for authenticating with the droplet

**How to get it:**

**Step 1: Generate SSH key pair (if you don't have one)**
```bash
# Generate a new SSH key pair
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/do_deploy_key

# Or use RSA if ed25519 isn't available
ssh-keygen -t rsa -b 4096 -C "github-actions-deploy" -f ~/.ssh/do_deploy_key
```

**Step 2: Add public key to Digital Ocean**

**Option A: Via Terraform (automatic)**
The Terraform configuration automatically uploads your SSH key. Make sure `ssh_public_key_path` in `terraform.tfvars` points to your public key:
```hcl
ssh_public_key_path = "~/.ssh/do_deploy_key.pub"
```

**Option B: Via doctl**
```bash
# Add SSH key to Digital Ocean
doctl compute ssh-key create github-actions-deploy --public-key-file ~/.ssh/do_deploy_key.pub

# Get the key ID
doctl compute ssh-key list

# Add to droplet (if droplet already exists)
doctl compute droplet create chrisvouga-dev \
  --image ubuntu-22-04-x64 \
  --size s-2vcpu-4gb \
  --region nyc1 \
  --ssh-keys <KEY_ID>
```

**Option C: Via Web Console**
1. Go to https://cloud.digitalocean.com/account/security
2. Click "Add SSH Key"
3. Paste your public key content (`cat ~/.ssh/do_deploy_key.pub`)
4. When creating droplet, select this key

**Step 3: Get private key content**
```bash
# Display private key (copy the entire output)
cat ~/.ssh/do_deploy_key

# Or if you're using an existing key
cat ~/.ssh/id_rsa  # or ~/.ssh/id_ed25519
```

**Set in GitHub:**
- Name: `DO_SSH_KEY`
- Value: Paste the entire private key (including `-----BEGIN` and `-----END` lines)

**Security Note:** Never commit private keys to git. Only add them as GitHub Secrets.

---

### 4. TMDB_API_READ_ACCESS_TOKEN (Required)
**What it is:** API token for The Movie Database API

**How to get it:**
1. Go to https://www.themoviedb.org/settings/api
2. Create an API key if you don't have one
3. Copy the "API Read Access Token"

**Set in GitHub:**
- Name: `TMDB_API_READ_ACCESS_TOKEN`
- Value: Your TMDB API token

---

### 5. TWILIO_ACCOUNT_SID (Required)
**What it is:** Twilio Account SID

**How to get it:**
1. Go to https://console.twilio.com/
2. Navigate to Account → Account Info
3. Copy the "Account SID"

**Set in GitHub:**
- Name: `TWILIO_ACCOUNT_SID`
- Value: Your Twilio Account SID

---

### 6. TWILIO_AUTH_TOKEN (Required)
**What it is:** Twilio Auth Token

**How to get it:**
1. Go to https://console.twilio.com/
2. Navigate to Account → Account Info
3. Copy the "Auth Token" (click to reveal)

**Set in GitHub:**
- Name: `TWILIO_AUTH_TOKEN`
- Value: Your Twilio Auth Token

---

### 7. TWILIO_SERVICE_SID (Required)
**What it is:** Twilio Service SID (for Verify service)

**How to get it:**
1. Go to https://console.twilio.com/
2. Navigate to Verify → Services
3. Select your service (or create one)
4. Copy the "Service SID"

**Set in GitHub:**
- Name: `TWILIO_SERVICE_SID`
- Value: Your Twilio Service SID

---

### 8. DEPLOY_DIR (Optional - defaults to '/opt/chrisvouga-dev')
**What it is:** Directory on the server where deployment files are stored

**Default value:** `/opt/chrisvouga-dev`

**Set in GitHub:**
- Name: `DEPLOY_DIR`
- Value: `/opt/chrisvouga-dev` (or your custom path)

---

## Quick Setup Checklist

- [ ] Generate SSH key pair (`ssh-keygen`)
- [ ] Add public key to Digital Ocean (via Terraform, doctl, or web console)
- [ ] Provision infrastructure with Terraform
- [ ] Get droplet IP from Terraform output or doctl
- [ ] Add all secrets to GitHub repository:
  - [ ] `DO_HOST` - Droplet IP address
  - [ ] `DO_USER` - SSH user (default: `root`)
  - [ ] `DO_SSH_KEY` - Private SSH key
  - [ ] `TMDB_API_READ_ACCESS_TOKEN` - TMDB API token
  - [ ] `TWILIO_ACCOUNT_SID` - Twilio Account SID
  - [ ] `TWILIO_AUTH_TOKEN` - Twilio Auth Token
  - [ ] `TWILIO_SERVICE_SID` - Twilio Service SID
  - [ ] `DEPLOY_DIR` - (optional) Deployment directory

## Testing SSH Connection

Before setting up GitHub Actions, test your SSH connection:

```bash
# Test SSH connection
ssh -i ~/.ssh/do_deploy_key root@<DROPLET_IP>

# Or if using default key
ssh root@<DROPLET_IP>
```

If connection works, you're ready to deploy!

## Using doctl for Quick Lookup

Install doctl: https://docs.digitalocean.com/reference/doctl/how-to/install/

```bash
# Authenticate
doctl auth init

# Get droplet IP quickly
doctl compute droplet list --format Name,PublicIPv4 --no-header | grep chrisvouga-dev | awk '{print $2}'

# Get all droplet info
doctl compute droplet get <DROPLET_ID> --format ID,Name,PublicIPv4,Status
```
