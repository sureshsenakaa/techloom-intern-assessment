#!/bin/bash
# ==============================================================================
# Techloom Assessment - VPS Backend APIs Deploy Script
# Sets up Task 01 (Port 5001) and Task 02 (Port 5002) connected to Neon Cloud DB
# ==============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "======================================================"
echo "  Deploying Techloom APIs on VPS (89.117.48.111)      "
echo "======================================================"

# 1. Check Node.js and PM2
if ! command -v node &> /dev/null; then
    echo "[1/4] Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    echo "[2/4] Installing PM2 globally..."
    sudo npm install -g pm2
fi

# 2. Setup Task 01 Backend (POS API - Port 5001)
echo "[3/4] Starting Task 01 POS Backend..."
cd "$ROOT_DIR/task-01/backend"
npm install
cat <<EOT > .env
PORT=5001
DATABASE_URL=postgresql://neondb_owner:npg_FI7ozEhSpD9P@ep-little-butterfly-ayf48fwd.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&options=-csearch_path%3Dtechloom_pos,public
DB_SSL=true
EOT

pm2 delete task-01-api 2>/dev/null || true
pm2 start src/server.js --name "task-01-api"

# 3. Setup Task 02 Backend (E-Commerce API - Port 5002)
echo "[4/4] Starting Task 02 E-Commerce Backend..."
cd "$ROOT_DIR/task-02/backend"
npm install
cat <<EOT > .env
PORT=5002
DATABASE_URL=postgresql://neondb_owner:npg_FI7ozEhSpD9P@ep-little-butterfly-ayf48fwd.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&options=-csearch_path%3Dtechloom_ecomm,public
DB_SSL=true
EOT

pm2 delete task-02-api 2>/dev/null || true
pm2 start src/server.js --name "task-02-api"

# 4. Open Firewall Ports 5001 and 5002
if command -v ufw &> /dev/null; then
    echo "Opening firewall ports 5001 and 5002..."
    sudo ufw allow 5001/tcp comment 'Task 01 POS API' || true
    sudo ufw allow 5002/tcp comment 'Task 02 E-Commerce API' || true
    sudo ufw reload || true
fi

# 5. Save PM2 processes
pm2 save

echo "======================================================"
echo "  🎉 APIs Running Successfully on VPS!"
echo "  Task 01 POS API:        http://89.117.48.111:5001"
echo "  Task 02 E-Commerce API: http://89.117.48.111:5002"
echo "======================================================"
pm2 status
