# GitHub Secrets Configuration Guide

This guide explains how to obtain and configure the required GitHub Secrets for deployment.

## Required GitHub Secrets

### 1. DOCKER_USERNAME (Required)
**What it is:** Docker Hub username for pushing images

**Set in GitHub:**
- Name: `DOCKER_USERNAME`
- Value: Your Docker Hub username

---

### 2. DOCKER_PASSWORD (Required)
**What it is:** Docker Hub password or access token

**How to get it:**
1. Go to https://hub.docker.com/settings/security
2. Create a new access token
3. Copy the token

**Set in GitHub:**
- Name: `DOCKER_PASSWORD`
- Value: Your Docker Hub password or access token

---

### 3. TMDB_API_READ_ACCESS_TOKEN (Required)
**What it is:** API token for The Movie Database API

**How to get it:**
1. Go to https://www.themoviedb.org/settings/api
2. Create an API key if you don't have one
3. Copy the "API Read Access Token"

**Set in GitHub:**
- Name: `TMDB_API_READ_ACCESS_TOKEN`
- Value: Your TMDB API token

---

### 4. TWILIO_ACCOUNT_SID (Required)
**What it is:** Twilio Account SID

**How to get it:**
1. Go to https://console.twilio.com/
2. Navigate to Account → Account Info
3. Copy the "Account SID"

**Set in GitHub:**
- Name: `TWILIO_ACCOUNT_SID`
- Value: Your Twilio Account SID

---

### 5. TWILIO_AUTH_TOKEN (Required)
**What it is:** Twilio Auth Token

**How to get it:**
1. Go to https://console.twilio.com/
2. Navigate to Account → Account Info
3. Copy the "Auth Token" (click to reveal)

**Set in GitHub:**
- Name: `TWILIO_AUTH_TOKEN`
- Value: Your Twilio Auth Token

---

### 6. TWILIO_SERVICE_SID (Required)
**What it is:** Twilio Service SID (for Verify service)

**How to get it:**
1. Go to https://console.twilio.com/
2. Navigate to Verify → Services
3. Select your service (or create one)
4. Copy the "Service SID"

**Set in GitHub:**
- Name: `TWILIO_SERVICE_SID`
- Value: Your Twilio Service SID

## Quick Setup Checklist

- [ ] Add all required secrets to GitHub repository:
  - [ ] `DOCKER_USERNAME` - Docker Hub username
  - [ ] `DOCKER_PASSWORD` - Docker Hub password/token
  - [ ] `TMDB_API_READ_ACCESS_TOKEN` - TMDB API token
  - [ ] `TWILIO_ACCOUNT_SID` - Twilio Account SID
  - [ ] `TWILIO_AUTH_TOKEN` - Twilio Auth Token
  - [ ] `TWILIO_SERVICE_SID` - Twilio Service SID
- [ ] Push to `main` branch - GitHub Actions handles everything automatically!
