const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

let pool = null;
let inMemoryDb = null;
let isInMemory = false;

function setupInMemoryDb() {
  const { newDb } = require('pg-mem');
  const mem = newDb();
  
  // Register basic uuid function for pg-mem if needed
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: mem.public.getType('text'),
    implementation: () => require('crypto').randomUUID()
  });

  const adapter = mem.adapters.createPg();
  const memPool = new adapter.Pool();
  isInMemory = true;
  return { mem, memPool };
}

async function getPool() {
  if (pool) return pool;

  if (process.env.DATABASE_URL) {
    console.log('[DB] Connecting to PostgreSQL Database URL...');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    isInMemory = false;
  } else {
    console.log('[DB] No DATABASE_URL found. Initializing high-fidelity in-memory PostgreSQL instance for instant zero-setup execution...');
    const { mem, memPool } = setupInMemoryDb();
    inMemoryDb = mem;
    pool = memPool;
  }

  return pool;
}

async function query(text, params) {
  const p = await getPool();
  return p.query(text, params);
}

async function getClient() {
  const p = await getPool();
  return p.connect();
}

async function initDb() {
  const schemaPath = path.join(__dirname, '../migrations/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  console.log('[DB] Applying schema migrations...');
  await query(schemaSql);

  // Check if products exist, seed initial products if table is empty
  const res = await query('SELECT COUNT(*) as count FROM products');
  const count = parseInt(res.rows[0].count, 10);
  if (count === 0) {
    console.log('[DB] Seeding initial products...');
    const seedProducts = [
      { name: 'Wireless Barcode Scanner', sku: 'SCAN-W01', description: 'High-speed 2D Bluetooth scanner', price: 89.99, stock: 10 },
      { name: 'Thermal Receipt Printer', sku: 'PRN-T80', description: '80mm USB & Ethernet receipt printer', price: 129.50, stock: 5 },
      { name: 'Limited Edition Smart POS Terminal', sku: 'POS-LTD-01', description: 'Flash-sale item with strictly limited stock', price: 299.00, stock: 1 },
      { name: 'Cash Drawer Electronic Lock', sku: 'DRW-E410', description: 'Heavy duty RJ11 POS cash drawer', price: 49.00, stock: 15 },
      { name: 'Touch POS Monitor 15.6"', sku: 'MON-T15', description: 'Capacitive touch 1080p display', price: 219.00, stock: 8 }
    ];

    for (const prod of seedProducts) {
      await query(
        `INSERT INTO products (name, sku, description, price, available_stock, reserved_stock)
         VALUES ($1, $2, $3, $4, $5, 0)`,
        [prod.name, prod.sku, prod.description, prod.price, prod.stock]
      );
    }
    console.log('[DB] Seeded 5 initial products successfully.');
  }

  console.log(`[DB] Database initialized successfully (Engine: ${isInMemory ? 'In-Memory PostgreSQL' : 'PostgreSQL Server'}).`);
}

module.exports = {
  query,
  getClient,
  getPool,
  initDb,
  isInMemory: () => isInMemory
};
