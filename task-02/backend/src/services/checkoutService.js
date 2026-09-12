const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class ProductLock {
  constructor() {
    this.locks = new Map();
  }

  async acquire(productIds) {
    const sorted = [...productIds].sort((a, b) => a - b);
    for (const id of sorted) {
      while (this.locks.has(id)) {
        await this.locks.get(id);
      }
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      this.locks.set(id, promise);
      promise.release = release;
    }
  }

  release(productIds) {
    for (const id of productIds) {
      const lockPromise = this.locks.get(id);
      if (lockPromise) {
        this.locks.delete(id);
        if (lockPromise.release) lockPromise.release();
      }
    }
  }
}

const productLock = new ProductLock();

class CheckoutService {
  async reserveAndCheckout({ items, customerName, customerEmail, shippingAddress, idempotencyKey }) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw { status: 400, message: 'Cart items cannot be empty.' };
    }

    const productIds = items.map(item => parseInt(item.productId, 10));
    await productLock.acquire(productIds);

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Check duplicate idempotency key
      if (idempotencyKey) {
        const existing = await client.query('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
        if (existing.rows.length > 0) {
          await client.query('COMMIT');
          return { order: existing.rows[0], duplicate: true };
        }
      }

      const orderId = uuidv4();
      const orderNumber = 'ECOMM-' + Date.now() + '-' + Math.floor(100 + Math.random() * 900);
      let totalAmount = 0;
      const verifiedItems = [];

      for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        const pid = parseInt(item.productId, 10);

        if (isNaN(qty) || qty <= 0) {
          throw { status: 400, message: `Invalid quantity for product ID ${pid}` };
        }

        const prodRes = await client.query(
          'SELECT id, name, price, available_stock, image_url FROM products WHERE id = $1 FOR UPDATE',
          [pid]
        );

        if (prodRes.rows.length === 0) {
          throw { status: 404, message: `Product ID ${pid} not found.` };
        }

        const product = prodRes.rows[0];

        // Atomic conditional decrement to eliminate race conditions
        const updateRes = await client.query(
          `UPDATE products 
           SET available_stock = available_stock - $1, 
               reserved_stock = reserved_stock + $1,
               updated_at = NOW()
           WHERE id = $2 AND available_stock >= $1
           RETURNING id, name, available_stock`,
          [qty, pid]
        );

        if (updateRes.rows.length === 0) {
          throw {
            status: 409,
            code: 'INSUFFICIENT_STOCK',
            message: `"${product.name}" is out of stock or requested quantity exceeds inventory.`
          };
        }

        const subtotal = Number(product.price) * qty;
        totalAmount += subtotal;

        verifiedItems.push({
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.price),
          quantity: qty,
          subtotal,
          imageUrl: product.image_url
        });
      }

      // Create Order
      const orderRes = await client.query(
        `INSERT INTO orders (id, order_number, status, total_amount, customer_name, customer_email, shipping_address, idempotency_key, created_at, updated_at)
         VALUES ($1, $2, 'RESERVED', $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [orderId, orderNumber, totalAmount, customerName || 'Customer', customerEmail || 'guest@example.com', shippingAddress || '', idempotencyKey || null]
      );

      // Insert line items
      for (const item of verifiedItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.productId, item.productName, item.unitPrice, item.quantity, item.subtotal]
        );
      }

      // Create 5-minute stock reservations
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      for (const item of verifiedItems) {
        await client.query(
          `INSERT INTO reservations (id, order_id, product_id, quantity, status, expires_at, created_at)
           VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW())`,
          [uuidv4(), orderId, item.productId, item.quantity, expiresAt.toISOString()]
        );
      }

      await client.query('COMMIT');

      return {
        order: orderRes.rows[0],
        items: verifiedItems,
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

    const items = await db.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    const payments = await db.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC', [orderId]);

    return {
      ...orderRes.rows[0],
      items: items.rows,
      payments: payments.rows
    };
  }

  async getOrdersByEmail(email) {
    let sql = 'SELECT * FROM orders';
    const params = [];
    if (email) {
      sql += ' WHERE LOWER(customer_email) = LOWER($1)';
      params.push(email.trim());
    }
    sql += ' ORDER BY created_at DESC';

    const ordersRes = await db.query(sql, params);
    const orders = ordersRes.rows;

    for (const ord of orders) {
      const itemsRes = await db.query('SELECT * FROM order_items WHERE order_id = $1', [ord.id]);
      ord.items = itemsRes.rows;
    }

    return orders;
  }
}

module.exports = new CheckoutService();
