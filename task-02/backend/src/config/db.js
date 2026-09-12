const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let pool = null;
let inMemoryDb = null;
let isInMemory = false;

function setupInMemoryDb() {
  const { newDb } = require('pg-mem');
  const mem = newDb();

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
    console.log('[E-Commerce DB] Connecting to PostgreSQL Database URL...');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    isInMemory = false;
  } else {
    console.log('[E-Commerce DB] No DATABASE_URL found. Initializing high-fidelity in-memory PostgreSQL instance for instant zero-setup execution...');
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

  console.log('[E-Commerce DB] Applying schema migrations...');
  await query(schemaSql);

  const res = await query('SELECT COUNT(*) as count FROM products');
  const count = parseInt(res.rows[0].count, 10);
  if (count === 0) {
    console.log('[E-Commerce DB] Seeding initial e-commerce catalog...');
    const seedCatalog = [
      {
        name: 'Ultra Wireless ANC Headphones',
        slug: 'ultra-wireless-anc-headphones',
        category: 'Audio',
        description: 'Premium active noise-cancelling over-ear headphones with 40h battery life and spatial audio.',
        price: 199.99,
        available_stock: 12,
        rating: 4.9,
        image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80'
      },
      {
        name: 'Mechanical RGB Gaming Keyboard',
        slug: 'mechanical-rgb-gaming-keyboard',
        category: 'Accessories',
        description: 'Hot-swappable linear mechanical switches with customizable per-key RGB backlighting.',
        price: 119.50,
        available_stock: 8,
        rating: 4.7,
        image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&q=80'
      },
      {
        name: 'Smart Fitness Tracker Pro',
        slug: 'smart-fitness-tracker-pro',
        category: 'Wearables',
        description: 'Continuous heart rate, SpO2 monitoring, GPS tracking, and 5ATM water resistance.',
        price: 79.00,
        available_stock: 15,
        rating: 4.6,
        image_url: 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=600&q=80'
      },
      {
        name: '4K Ultra-Wide Curved Monitor 34"',
        slug: '4k-ultra-wide-curved-monitor-34',
        category: 'Electronics',
        description: '144Hz refresh rate, 1ms response time, HDR400 immersive curved gaming and productivity display.',
        price: 499.00,
        available_stock: 4,
        rating: 4.9,
        image_url: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&q=80'
      },
      {
        name: 'Ergonomic Vertical Wireless Mouse',
        slug: 'ergonomic-vertical-wireless-mouse',
        category: 'Accessories',
        description: 'Natural handshake position reduces wrist strain. Dual Bluetooth and 2.4G wireless modes.',
        price: 45.00,
        available_stock: 20,
        rating: 4.5,
        image_url: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600&q=80'
      },
      {
        name: 'Studio USB Condenser Microphone',
        slug: 'studio-usb-condenser-microphone',
        category: 'Audio',
        description: 'Cardioid pickup pattern with built-in pop filter, zero-latency headphone monitoring, and mute touch sensor.',
        price: 139.00,
        available_stock: 6,
        rating: 4.8,
        image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&q=80'
      },
      {
        name: 'Titanium Smartwatch Series X',
        slug: 'titanium-smartwatch-series-x',
        category: 'Wearables',
        description: 'Grade 5 titanium casing, sapphire crystal display, ECG sensor, and cellular LTE connectivity.',
        price: 349.00,
        available_stock: 5,
        rating: 4.9,
        image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80'
      },
      {
        name: 'Limited Cyberpunk Custom Keycap Set',
        slug: 'limited-cyberpunk-custom-keycap-set',
        category: 'Accessories',
        description: 'Ultra-rare dye-sublimated PBT cherry profile keycaps. Strictly limited to 1 piece remaining in stock!',
        price: 65.00,
        available_stock: 1,
        rating: 5.0,
        image_url: 'https://images.unsplash.com/photo-1601445638532-3c6f6c3aa1d6?w=600&q=80'
      }
    ];

    for (const prod of seedCatalog) {
      await query(
        `INSERT INTO products (name, slug, category, description, price, available_stock, reserved_stock, rating, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)`,
        [prod.name, prod.slug, prod.category, prod.description, prod.price, prod.available_stock, prod.rating, prod.image_url]
      );
    }
    console.log('[E-Commerce DB] Seeded 8 products successfully.');
  }

  console.log(`[E-Commerce DB] Database initialized (Engine: ${isInMemory ? 'In-Memory PostgreSQL' : 'PostgreSQL Server'}).`);
}

module.exports = {
  query,
  getClient,
  getPool,
  initDb,
  isInMemory: () => isInMemory
};
