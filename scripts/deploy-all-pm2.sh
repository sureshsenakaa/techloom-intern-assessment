#!/bin/bash
# ==============================================================================
# Techloom Assessment - Complete VPS PM2 Deployment Script
# Automatically installs dependencies, builds frontends, and starts all services.
# ==============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "======================================================"
echo "  Deploying Techloom Assessment Services via PM2      "
echo "======================================================"

# Determine Server Host (IP or Domain)
SERVER_IP=$(curl -s ifconfig.me || echo "localhost")
echo "Detected Public IP: $SERVER_IP"

# 1. Install PM2 and serve globally if not present
if ! command -v pm2 &> /dev/null; then
    echo "[1/6] Installing PM2..."
    sudo npm install -g pm2
fi

# 2. Task 01 Backend (Port 5001)
echo "[2/6] Setting up Task 01 POS Backend..."
cd "$ROOT_DIR/task-01/backend"
npm install
pm2 delete task-01-api 2>/dev/null || true
pm2 start src/server.js --name "task-01-api"

# 3. Task 01 Frontend (Port 5173)
echo "[3/6] Building and serving Task 01 POS Frontend..."
cd "$ROOT_DIR/task-01/frontend"
npm install
# Set API URL pointing to the VPS public IP
echo "VITE_API_URL=http://$SERVER_IP:5001/api" > .env
npm run build
pm2 delete task-01-ui 2>/dev/null || true
pm2 serve dist 5173 --spa --name "task-01-ui"

# 4. Task 02 Backend (Port 5002)
echo "[4/6] Setting up Task 02 E-Commerce Backend..."
cd "$ROOT_DIR/task-02/backend"
npm install
pm2 delete task-02-api 2>/dev/null || true
pm2 start src/server.js --name "task-02-api"

# 5. Task 02 Frontend (Port 5174)
echo "[5/6] Building and serving Task 02 E-Commerce Frontend..."
cd "$ROOT_DIR/task-02/frontend"
npm install
echo "VITE_API_URL=http://$SERVER_IP:5002/api" > .env
npm run build
pm2 delete task-02-ui 2>/dev/null || true
pm2 serve dist 5174 --spa --name "task-02-ui"

# 6. Save PM2 processes & Configure Firewall
echo "[6/6] Saving PM2 state and configuring Firewall..."
pm2 save

if command -v ufw &> /dev/null; then
    echo "Configuring UFW Firewall ports..."
    sudo ufw allow 5001/tcp comment 'Techloom Task 01 API' || true
    sudo ufw allow 5173/tcp comment 'Techloom Task 01 UI' || true
    sudo ufw allow 5002/tcp comment 'Techloom Task 02 API' || true
    sudo ufw allow 5174/tcp comment 'Techloom Task 02 UI' || true
    sudo ufw reload || true
fi

echo "======================================================"
echo "  🎉 All Services Deployed Successfully on VPS!"
echo "======================================================"
echo "  Task 01 POS UI:         http://$SERVER_IP:5173"
echo "  Task 01 POS API:        http://$SERVER_IP:5001"
echo "  Task 02 Storefront UI:  http://$SERVER_IP:5174"
echo "  Task 02 Storefront API: http://$SERVER_IP:5002"
echo "======================================================"
pm2 status
