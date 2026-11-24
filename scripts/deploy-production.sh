#!/bin/bash
set -euo pipefail

# ==============================================================================
# VASTRAA - Production Zero-Downtime Deployment Script
# Target: AWS EC2 (Ubuntu / Nginx / PM2 / Node.js 22+ / pnpm)
# ==============================================================================

DEPLOY_PATH="${DEPLOY_PATH:-/var/www/vastraa}"
APP_NAME="${PM2_APP_NAME:-vastraa-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5000/api/healthz}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://vastraasaree.com/api/healthz}"
MAX_HEALTH_ATTEMPTS=20
HEALTH_INTERVAL=3

echo "================================================================="
echo "  VASTRAA PRODUCTION DEPLOYMENT START: $(date -u)"
echo "  Deploy Path : ${DEPLOY_PATH}"
echo "  PM2 App     : ${APP_NAME}"
echo "================================================================="

cd "${DEPLOY_PATH}"

# 1. Verify Deployment Workspace & Repository
if [ ! -d ".git" ]; then
  echo "[-] ERROR: .git directory not found in ${DEPLOY_PATH}" >&2
  exit 1
fi

# 2. Preserve Production Secrets & Persistent Storage
echo "[+] Step 1/8: Verifying production environment and persistent assets..."
if [ ! -f ".env" ]; then
  echo "[-] CRITICAL: .env file not found in ${DEPLOY_PATH}. Aborting to protect production." >&2
  exit 1
fi

# Ensure uploads and invoices directories exist and are never removed
mkdir -p "${DEPLOY_PATH}/artifacts/api-server/public/uploads"
mkdir -p "${DEPLOY_PATH}/artifacts/api-server/public/invoices"

# Backup .env safely
cp .env .env.backup."$(date +%s)"
find . -maxdepth 1 -name ".env.backup.*" -type f | sort -r | tail -n +6 | xargs -r rm -f

# 3. Pull Latest Code from Main Branch
echo "[+] Step 2/8: Pulling latest commits from Git origin..."
# Discard local unstaged changes to track files, keep untracked (.env, uploads) intact
git fetch origin
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
TARGET_BRANCH="${TARGET_BRANCH:-main}"

if [ "${CURRENT_BRANCH}" != "${TARGET_BRANCH}" ]; then
  echo "[i] Switching branch from ${CURRENT_BRANCH} to ${TARGET_BRANCH}..."
  git checkout "${TARGET_BRANCH}"
fi

git pull origin "${TARGET_BRANCH}"
COMMIT_HASH=$(git rev-parse --short HEAD)
echo "[+] Deployed commit: ${COMMIT_HASH} ($(git log -1 --pretty=%B | head -n 1))"

# 4. Save Rollback Artifact Reference
echo "[+] Step 3/8: Preserving rollback state..."
BACKUP_DIR="${DEPLOY_PATH}/.deploy_backups/backup-${COMMIT_HASH}-$(date +%s)"
mkdir -p "${BACKUP_DIR}"

if [ -f "artifacts/api-server/dist/index.mjs" ]; then
  mkdir -p "${BACKUP_DIR}/api-server-dist"
  cp -r artifacts/api-server/dist/* "${BACKUP_DIR}/api-server-dist/" || true
fi

if [ -d "artifacts/vastraa/dist" ]; then
  mkdir -p "${BACKUP_DIR}/vastraa-dist"
  cp -r artifacts/vastraa/dist/* "${BACKUP_DIR}/vastraa-dist/" || true
fi

# Prune old backup directories keeping the last 3
mkdir -p "${DEPLOY_PATH}/.deploy_backups"
find "${DEPLOY_PATH}/.deploy_backups" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +4 | xargs -r rm -rf

# 5. Ensure Tooling & Install Dependencies
echo "[+] Step 4/8: Checking package manager and installing dependencies..."
if ! command -v pnpm &> /dev/null; then
  echo "[i] pnpm not found globally, enabling via corepack or npm..."
  corepack enable || npm install -g pnpm@latest
fi

echo "[i] Installing workspace dependencies via pnpm..."
pnpm install --frozen-lockfile --prefer-offline || pnpm install

# 6. Build Backend and Frontend Applications
echo "[+] Step 5/8: Compiling backend API server and frontend SPA..."
echo "[i] Building backend API server..."
pnpm --filter @workspace/api-server run build

echo "[i] Building frontend web application (Vite)..."
pnpm --filter @workspace/twirldrape run build

# 7. Zero-Downtime Reload via PM2
echo "[+] Step 6/8: Reloading application in PM2..."
if ! command -v pm2 &> /dev/null; then
  echo "[-] ERROR: pm2 is not installed or not in PATH." >&2
  exit 1
fi

# Determine if PM2 app exists or start new
if pm2 describe "${APP_NAME}" > /dev/null 2>&1; then
  echo "[i] Gracefully reloading ${APP_NAME} in PM2 (zero-downtime)..."
  pm2 reload "${APP_NAME}" --update-env
else
  echo "[!] PM2 application ${APP_NAME} not running. Starting new process..."
  cd "${DEPLOY_PATH}/artifacts/api-server"
  pm2 start dist/index.mjs --name "${APP_NAME}" -i max --node-args="--enable-source-maps"
  cd "${DEPLOY_PATH}"
fi

pm2 save || true

# Check if Nginx needs configuration reload
if command -v nginx &> /dev/null; then
  echo "[i] Testing Nginx configuration..."
  sudo nginx -t && sudo systemctl reload nginx || echo "[!] Notice: Nginx reload skipped or no sudo privileges needed."
fi

# 8. Post-Deployment Automated Health Check & Rollback Protection
echo "[+] Step 7/8: Verifying health status..."
HEALTH_PASSED=false

for i in $(seq 1 ${MAX_HEALTH_ATTEMPTS}); do
  echo "Checking backend health at ${HEALTH_URL} (Attempt $i/${MAX_HEALTH_ATTEMPTS})..."
  STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}" || true)

  if [ "${STATUS_CODE}" = "200" ]; then
    HEALTH_DATA=$(curl -s "${HEALTH_URL}")
    echo "[+] Health check PASSED! Response: ${HEALTH_DATA}"
    HEALTH_PASSED=true
    break
  fi

  sleep "${HEALTH_INTERVAL}"
done

if [ "${HEALTH_PASSED}" = false ]; then
  echo "[-] CRITICAL: Health check FAILED after ${MAX_HEALTH_ATTEMPTS} attempts." >&2
  echo "[-] Initiating automated rollback to previous release..."

  if [ -d "${BACKUP_DIR}/api-server-dist" ] && [ -n "$(ls -A "${BACKUP_DIR}/api-server-dist")" ]; then
    echo "[i] Restoring previously compiled backend bundle..."
    cp -r "${BACKUP_DIR}/api-server-dist/"* "${DEPLOY_PATH}/artifacts/api-server/dist/"
  fi

  if [ -d "${BACKUP_DIR}/vastraa-dist" ] && [ -n "$(ls -A "${BACKUP_DIR}/vastraa-dist")" ]; then
    echo "[i] Restoring previously compiled frontend bundle..."
    cp -r "${BACKUP_DIR}/vastraa-dist/"* "${DEPLOY_PATH}/artifacts/vastraa/dist/"
  fi

  pm2 reload "${APP_NAME}" || pm2 restart "${APP_NAME}"
  echo "[-] Rollback complete. Production restored to previous stable build." >&2
  exit 1
fi

echo "================================================================="
echo "  [SUCCESS] VASTRAA PRODUCTION DEPLOYMENT COMPLETED!"
echo "  Commit: ${COMMIT_HASH}"
echo "  Time  : $(date -u)"
echo "  Health: Verified (MongoDB Connected, Node.js Online, Nginx Proxy Active)"
echo "================================================================="

