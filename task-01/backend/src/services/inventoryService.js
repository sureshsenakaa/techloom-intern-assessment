const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// In-process lock mechanism to serialize concurrent checkout requests for identical products
class ProductLock {
  constructor() {
    this.locks = new Map();
  }

  async acquire(productIds) {
    // Sort IDs to prevent deadlocks
    const sorted = [...productIds].sort((a, b) => a - b);
    for (const id of sorted) {
      while (this.locks.has(id)) {
        await this.locks.get(id);
      }
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      this.locks.set(id, promise);
      // Attach release resolver
      promise.release = release;
    }
  }

  release(productIds) {
    for (const id of productIds) {
      const lockPromise = this.locks.get(id);
      if (lockPromise) {
        this.locks.delete(id);
        if (lockPromise.release) {
          lockPromise.release();
        }
      }
    }
  }
}

const productLock = new ProductLock();

class InventoryService {
  async getAllProducts() {
    const res = await db.query(
      'SELECT id, name, sku, description, price, available_stock, reserved_stock, created_at, updated_at FROM products ORDER BY id ASC'
    );
    return res.rows;
  }

  async getProductById(id) {
    const res = await db.query(
      'SELECT id, name, sku, description, price, available_stock, reserved_stock, created_at, updated_at FROM products WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  }

  async createProduct({ name, sku, description, price, available_stock }) {
    const res = await db.query(
      `INSERT INTO products (name, sku, description, price, available_stock, reserved_stock)
       VALUES ($1, $2, $3, $4, $5, 0)
       RETURNING *`,
      [name, sku, description || '', price, available_stock || 0]
    );
    return res.rows[0];
  }

  async updateProduct(id, fields) {
    const allowed = ['name', 'sku', 'description', 'price', 'available_stock'];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = $${idx}`);
        values.push(fields[key]);
        idx++;
      }
    }

    if (sets.length === 0) {
      return this.getProductById(id);
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await db.query(query, values);
    return res.rows[0] || null;
  }

  async deleteProduct(id) {
    const res = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    return res.rowCount > 0;
  }

  async getProductStock(id) {
    const res = await db.query(
      'SELECT id, name, sku, available_stock, reserved_stock FROM products WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  }

  /**
   * Concurrency-safe order creation with 5-minute stock reservation.
   * Dual-layer concurrency protection:
   * 1. In-process mutex (ProductLock) serializes concurrent requests in Node event loop.
   * 2. Atomic conditional SQL update (UPDATE ... WHERE available_stock >= $qty) guarantees
   *    overselling is physically impossible even across distributed instances and database connections.
   */
  async reserveAndCreateOrder({ items, customerName, customerEmail, idempotencyKey }) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw { status: 400, message: 'Cart items cannot be empty.' };
    }

    const productIds = items.map(item => parseInt(item.productId, 10));
    await productLock.acquire(productIds);

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Idempotency check: if order with this key already exists, return it
      if (idempotencyKey) {
        const existingOrder = await client.query(
          'SELECT * FROM orders WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (existingOrder.rows.length > 0) {
          await client.query('COMMIT');
          return {
            order: existingOrder.rows[0],
            isDuplicate: true,
            message: 'Order already processed for this idempotency key.'
          };
        }
      }

      const orderId = uuidv4();
      const orderNumber = 'ORD-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
      let totalAmount = 0;
      const verifiedItems = [];

      for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        const pid = parseInt(item.productId, 10);

        if (isNaN(qty) || qty <= 0) {
          throw { status: 400, message: `Invalid quantity for product ID ${item.productId}.` };
        }

        // Row lock & check in database
        const prodCheck = await client.query(
          'SELECT id, name, price, available_stock, reserved_stock FROM products WHERE id = $1 FOR UPDATE',
          [pid]
        );

        if (prodCheck.rows.length === 0) {
          throw { status: 404, message: `Product ID ${pid} not found.` };
        }

        const product = prodCheck.rows[0];

        // ATOMIC CONDITIONAL UPDATE:
        // Guarantees stock decrement only if available_stock >= qty
        const updateRes = await client.query(
          `UPDATE products 
           SET available_stock = available_stock - $1, 
               reserved_stock = reserved_stock + $1,
               updated_at = NOW()
           WHERE id = $2 AND available_stock >= $1
           RETURNING id, name, price, available_stock, reserved_stock`,
          [qty, pid]
        );

        if (updateRes.rows.length === 0 || updateRes.rowCount === 0) {
          throw {
            status: 409,
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for "${product.name}". Available: ${product.available_stock}, Requested: ${qty}.`
          };
        }

        const subtotal = Number(product.price) * qty;
        totalAmount += subtotal;

        verifiedItems.push({
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.price),
          quantity: qty,
          subtotal
        });
      }

      // Insert order with RESERVED status
      const orderRes = await client.query(
        `INSERT INTO orders (id, order_number, status, total_amount, customer_name, customer_email, idempotency_key, created_at, updated_at)
         VALUES ($1, $2, 'RESERVED', $3, $4, $5, $6, NOW(), NOW())
         RETURNING *`,
        [orderId, orderNumber, totalAmount, customerName || 'Walk-in Customer', customerEmail || '', idempotencyKey || null]
      );

      // Insert order items
      for (const item of verifiedItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.productId, item.productName, item.unitPrice, item.quantity, item.subtotal]
        );
      }

      // Create 5-minute stock reservations
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL
      const reservations = [];

      for (const item of verifiedItems) {
        const resId = uuidv4();
        const res = await client.query(
          `INSERT INTO reservations (id, order_id, product_id, quantity, status, expires_at, created_at)
           VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW())
           RETURNING *`,
          [resId, orderId, item.productId, item.quantity, expiresAt.toISOString()]
        );
        reservations.push(res.rows[0]);
      }

      await client.query('COMMIT');

      return {
        order: orderRes.rows[0],
        items: verifiedItems,
        reservations,
        expiresAt: expiresAt.toISOString(),
        expiresInSeconds: 300
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
      productLock.release(productIds);
    }
  }

  async getOrderById(orderId) {
    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderRes.rows.length === 0) return null;

    const itemsRes = await db.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    const resRes = await db.query('SELECT * FROM reservations WHERE order_id = $1', [orderId]);
    const payRes = await db.query('SELECT * FROM payments WHERE order_id = $1', [orderId]);

    return {
      ...orderRes.rows[0],
      items: itemsRes.rows,
      reservations: resRes.rows,
      payments: payRes.rows
    };
  }

  async getAllOrders() {
    const ordersRes = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
    return ordersRes.rows;
  }
}

module.exports = new InventoryService();
