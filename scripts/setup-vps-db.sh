#!/bin/bash
# ==============================================================================
# Techloom Assessment - Automated VPS PostgreSQL Database Setup Script
# Works on: Ubuntu 20.04 / 22.04 / 24.04 & Debian
# ==============================================================================

set -e

DB_USER="techloom_user"
DB_PASS="TechloomSecure2026!"
DB_POS="techloom_pos"
DB_ECOMM="techloom_ecomm"

echo "======================================================"
echo "  Setting up PostgreSQL for Techloom Assessment on VPS "
echo "======================================================"

# 1. Install PostgreSQL if not installed
if ! command -v psql &> /dev/null; then
    echo "[1/5] Installing PostgreSQL and contrib packages..."
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
else
    echo "[1/5] PostgreSQL is already installed."
fi

# 2. Ensure PostgreSQL service is active
echo "[2/5] Starting & enabling PostgreSQL service..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 3. Create Database User and Databases
echo "[3/5] Creating databases ($DB_POS, $DB_ECOMM) and user ($DB_USER)..."

sudo -u postgres psql <<EOF
-- Create user if not exists
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';
  END IF;
END
\$\$;

-- Create Task 01 Database
SELECT 'CREATE DATABASE $DB_POS OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_POS')\gexec

-- Create Task 02 Database
SELECT 'CREATE DATABASE $DB_ECOMM OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_ECOMM')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_POS TO $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_ECOMM TO $DB_USER;
EOF

# Grant schema permissions in Postgres 15+
sudo -u postgres psql -d $DB_POS -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
sudo -u postgres psql -d $DB_ECOMM -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

# 4. Generate .env files for Task 01 and Task 02
echo "[4/5] Generating backend .env configuration files..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cat <<EOT > "$ROOT_DIR/task-01/backend/.env"
PORT=5001
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_POS
DB_SSL=false
EOT

cat <<EOT > "$ROOT_DIR/task-02/backend/.env"
PORT=5002
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_ECOMM
DB_SSL=false
EOT

echo "✓ Created $ROOT_DIR/task-01/backend/.env"
echo "✓ Created $ROOT_DIR/task-02/backend/.env"

# 5. Verify Connections
echo "[5/5] Testing connections to databases..."
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_POS" -c "SELECT 'Connected to Task 01 DB successfully!' AS status;"
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_ECOMM" -c "SELECT 'Connected to Task 02 DB successfully!' AS status;"

echo "======================================================"
echo "  ✅ PostgreSQL Database Setup Completed Successfully!"
echo "  Database 1 (POS):        $DB_POS"
echo "  Database 2 (E-Commerce): $DB_ECOMM"
echo "  Username:                $DB_USER"
echo "======================================================"
