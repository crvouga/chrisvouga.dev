# Squarespace DNS Configuration

This document contains the minimal DNS records needed for Fly.io deployment using shared IPv4.

## Overview

With Fly.io's shared IPv4 approach, we only need **2 DNS records** in Squarespace. Fly's edge proxy handles routing to the correct app based on the hostname.

## DNS Records

Add these records in your Squarespace DNS settings:

| Type | Host | Data | TTL | Description |
|------|------|------|-----|-------------|
| A | @ | `[Fly Shared IPv4]` | Auto | Apex domain - routes `chrisvouga.dev` |
| A | * | `[Fly Shared IPv4]` | Auto | Wildcard - routes all subdomains |

**Note:** Replace `[Fly Shared IPv4]` with the actual IPv4 address. Get it by running:
```bash
fly ips list -a crvouga-portfolio
```

Look for the IPv4 address in the output.

## How Routing Works

Fly's edge proxy routes traffic based on hostname:

- `chrisvouga.dev` → portfolio app (handles redirect to www)
- `www.chrisvouga.dev` → portfolio app
- `pickflix.chrisvouga.dev` → pickflix app
- `moviefinder-rust.chrisvouga.dev` → moviefinder-app-rust
- `moviefinder-go.chrisvouga.dev` → moviefinder-app-go
- `moviefinder-react.chrisvouga.dev` → moviefinder-app-react
- `moviefinder-cljs.chrisvouga.dev` → moviefinder-app-clojurescript
- `todo.chrisvouga.dev` → todo-app
- `image-service.chrisvouga.dev` → image-service
- `connect-four.chrisvouga.dev` → connect-four
- `screenshot-service.chrisvouga.dev` → screenshot-service
- `anime.chrisvouga.dev` → anime-blog
- `snake.chrisvouga.dev` → snake-game
- `match-three.chrisvouga.dev` → match-three
- `simon-says.chrisvouga.dev` → simon-says
- `headless-combobox-docs.chrisvouga.dev` → headless-combobox-docs
- `headless-combobox-svelte.chrisvouga.dev` → headless-combobox-svelte-example

## Routing Configuration

Routing is configured automatically when you run the deployment script (`fly/deploy.sh`). The script uses `fly certs add` to tell Fly's edge which app handles which domain.

## Post-Deployment Steps

1. **Deploy all apps** using the GitHub Action or manually running `fly/deploy.sh`
2. **Get the shared IPv4 address**:
   ```bash
   fly ips list -a crvouga-portfolio
   ```
3. **Add DNS records** in Squarespace using the IPv4 address from step 2
4. **Wait for DNS propagation** (usually 5-15 minutes)
5. **Test subdomains** by visiting each URL

## Troubleshooting

- **DNS not resolving**: Wait a few minutes for propagation, then check with `dig chrisvouga.dev` or `nslookup chrisvouga.dev`
- **Wrong app responding**: Verify certificates are added correctly with `fly certs list -a {app-name}`
- **SSL errors**: Fly.io automatically provisions SSL certificates via Let's Encrypt. Wait a few minutes after adding certificates.
