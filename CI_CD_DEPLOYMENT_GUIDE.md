# 🚀 VASTRAA — CI/CD Pipeline & AWS EC2 Deployment Documentation

This document provides a comprehensive guide for the automated Continuous Integration (CI) and Continuous Deployment (CD) pipeline for **VASTRAA**, running on **AWS EC2** with **Nginx**, **PM2**, and **MongoDB Atlas**.

---

## 1. CI/CD Architecture Overview

```text
[ Developer: git push to GitHub ]
                 │
                 ▼
      [ GitHub Actions Trigger ]
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
  [ ci.yml ]      [ deploy-production.yml ]
       │                   │
       ├─ pnpm install     ├─ Run CI Validation
       ├─ Typecheck Vite   ├─ Connect to AWS EC2 via SSH Agent
       ├─ Build Backend    ├─ Pull Latest Code (git pull)
       ├─ Build Frontend   ├─ Backup Current Artifacts
       └─ Verify Bundles   ├─ Compile Dist Bundles (pnpm build)
                           ├─ Zero-Downtime PM2 Reload (pm2 reload)
                           ├─ Automated Rollback if Health Check Fails
                           ├─ Nginx Config Reload (if required)
                           └─ Verify https://vastraasaree.com/api/healthz
```

---

## 2. GitHub Repository Secrets

Configure the following secrets in your GitHub repository:
👉 **Settings > Secrets and variables > Actions > New repository secret**

| Secret Name | Description | Example / Typical Value |
|---|---|---|
| `EC2_HOST` | Public IP or Public DNS of your AWS EC2 instance | `52.65.36.110` or `ec2-52-65-36-110.compute-1.amazonaws.com` |
| `EC2_USERNAME` | SSH user of the EC2 instance | `ubuntu` (for Ubuntu AMI) or `ec2-user` |
| `EC2_SSH_PRIVATE_KEY` | Entire PEM/RSA OpenSSH private key used to connect to EC2 | `-----BEGIN OPENSSH PRIVATE KEY----- ...` |
| `EC2_DEPLOY_PATH` | Absolute path to the repository on your EC2 instance | `/var/www/vastraa` or `/home/ubuntu/vastraa` |

> [!IMPORTANT]
> - Never commit `.env` or SSH keys into GitHub.
> - The production `.env` file lives securely on the EC2 server and is preserved across all automated deployments.

---

## 3. Server-Side Setup on AWS EC2

### 3.1 Initial Directory & Git Repository Setup
Ensure the VASTRAA repository is cloned into the target deploy directory on EC2:
```bash
# Example deploy location
sudo mkdir -p /var/www/vastraa
sudo chown -R $USER:$USER /var/www/vastraa
git clone https://github.com/Sanketingale08/VASHTRAA.git /var/www/vastraa
cd /var/www/vastraa
```

### 3.2 Ensure Required Runtime & Tooling
Verify Node.js, pnpm, and PM2 are installed on the EC2 instance:
```bash
# Node.js 22 LTS
node -v

# Enable pnpm
corepack enable
pnpm -v

# PM2 Process Manager
npm install -g pm2
pm2 -v
```

### 3.3 Ensure SSH Key Setup on EC2
Ensure the public key matching `EC2_SSH_PRIVATE_KEY` is present in `~/.ssh/authorized_keys`:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 3.4 Production `.env`
Place the production `.env` file at the root `/var/www/vastraa/.env`.
Ensure permissions are restricted:
```bash
chmod 600 /var/www/vastraa/.env
```

---

## 4. Production Deployment & Safety Guarantees

The automated deployment script (`scripts/deploy-production.sh` and `deploy-production.yml`) provides:

1. **Production Data Safety**:
   - Never deletes or drops MongoDB Atlas collections.
   - Preserves user uploaded images and assets in `artifacts/api-server/public/uploads` and `invoices`.
   - Never runs database reset or seeding operations in production.
2. **Atomic Rollback Mechanism**:
   - Backs up the active `dist/` bundles prior to compilation.
   - If `http://127.0.0.1:5000/api/healthz` does not respond with HTTP 200 within 60 seconds after PM2 reload, the previous working bundle is restored automatically.
3. **Zero-Downtime Reload**:
   - Uses `pm2 reload vastraa-api` which keeps worker processes active while new instances spin up.

---

## 5. Health Checks & Verification

After deployment, GitHub Actions automatically queries:
- **Frontend**: `https://vastraasaree.com` (expects HTTP 200)
- **Backend & Database**: `https://vastraasaree.com/api/healthz`
  - Validates `status: "ok"`
  - Validates `"database": { "connected": true }`

---

## 6. Manual Deployment & Troubleshooting

### To Run Deployment Manually on Server:
If you need to deploy manually from SSH terminal:
```bash
cd /var/www/vastraa
bash scripts/deploy-production.sh
```

### To Check Live PM2 Logs:
```bash
pm2 status
pm2 logs vastraa-api --lines 100
```

### To Inspect Nginx Logs:
```bash
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Manual Rollback:
If an issue occurs and you need to manually roll back to the previous release:
```bash
cd /var/www/vastraa
# Check available backups
ls -ld .deploy_backups/*

# Restore latest backup
LATEST_BACKUP=$(ls -td .deploy_backups/* | head -n 1)
cp -r "$LATEST_BACKUP/api-server-dist/"* artifacts/api-server/dist/
cp -r "$LATEST_BACKUP/vastraa-dist/"* artifacts/vastraa/dist/
pm2 reload vastraa-api
```

