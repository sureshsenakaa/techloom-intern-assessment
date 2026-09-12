#!/bin/bash
# ==============================================================================
# Techloom Assessment - VPS Backend APIs Deploy Script
# Sets up Task 01 (Port 8081) and Task 02 (Port 8082) connected to Neon Cloud DB
# Completely isolated from existing projects on ports 3000, 3005, 5000, 5005, 5010!
# ==============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "======================================================"
echo "  Deploying Techloom APIs on Ports 8081 & 8082        "
echo "======================================================"

# 1. Check Node.js and PM2
if ! command -v node &> /dev/null; then
    echo "[1/4] Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    echo "[2/4] Installing PM2 globally..."
    sudo npm install -g pm2
fi

# 2. Setup Task 01 Backend (POS API - Port 8081)
echo "[3/4] Starting Task 01 POS Backend on Port 8081..."
cd "$ROOT_DIR/task-01/backend"
npm install
cat <<EOT > .env
PORT=8081
DATABASE_URL=postgresql://neondb_owner:npg_FI7ozEhSpD9P@ep-little-butterfly-ayf48fwd.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&options=-csearch_path%3Dtechloom_pos,public
DB_SSL=true
EOT

pm2 delete techloom-pos-api 2>/dev/null || true
pm2 start src/server.js --name "techloom-pos-api"

# 3. Setup Task 02 Backend (E-Commerce API - Port 8082)
echo "[4/4] Starting Task 02 E-Commerce Backend on Port 8082..."
cd "$ROOT_DIR/task-02/backend"
npm install
cat <<EOT > .env
PORT=8082
DATABASE_URL=postgresql://neondb_owner:npg_FI7ozEhSpD9P@ep-little-butterfly-ayf48fwd.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&options=-csearch_path%3Dtechloom_ecomm,public
DB_SSL=true
EOT

pm2 delete techloom-ecomm-api 2>/dev/null || true
pm2 start src/server.js --name "techloom-ecomm-api"

# 4. Open Firewall Ports 8081 and 8082
if command -v ufw &> /dev/null; then
    echo "Opening firewall ports 8081 and 8082..."
    sudo ufw allow 8081/tcp comment 'Techloom POS API' || true
    sudo ufw allow 8082/tcp comment 'Techloom E-Commerce API' || true
    sudo ufw reload || true
fi

# 5. Save PM2 processes
pm2 save

echo "======================================================"
echo "  🎉 APIs Running Successfully on VPS!"
echo "  Task 01 POS API:        http://89.117.48.111:8081"
echo "  Task 02 E-Commerce API: http://89.117.48.111:8082"
echo "======================================================"
pm2 status
