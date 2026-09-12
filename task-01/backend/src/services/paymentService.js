const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const reservationWorker = require('./reservationWorker');

class PaymentService {
  /**
   * Process mock payment with outcomes: 'SUCCESS', 'FAILED', or 'TIMEOUT'
   * Detects duplicate submissions via idempotency_key.
   */
  async processPayment({ orderId, outcome = 'SUCCESS', idempotencyKey }) {
    if (!orderId) {
      throw { status: 400, message: 'Order ID is required.' };
    }

    const validOutcomes = ['SUCCESS', 'FAILED', 'TIMEOUT'];
    if (!validOutcomes.includes(outcome.toUpperCase())) {
      throw { status: 400, message: `Invalid outcome. Must be one of: ${validOutcomes.join(', ')}` };
    }

    const cleanOutcome = outcome.toUpperCase();
    const finalIdempotencyKey = idempotencyKey || `PAY-${orderId}-${Date.now()}`;

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. Check for duplicate payment submission using idempotency_key
      const existingPayment = await client.query(
        'SELECT * FROM payments WHERE idempotency_key = $1',
        [finalIdempotencyKey]
      );

      if (existingPayment.rows.length > 0) {
        await client.query('COMMIT');
        return {
          duplicate: true,
          payment: existingPayment.rows[0],
          message: 'Duplicate payment detected. Returning existing payment record.'
        };
      }

      // 2. Lock and verify the order
      const orderRes = await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );

      if (orderRes.rows.length === 0) {
        throw { status: 404, message: `Order #${orderId} not found.` };
      }

      const order = orderRes.rows[0];

      // Check if order is already Paid or Cancelled
      if (order.status === 'PAID') {
        throw { status: 400, message: 'Order has already been paid.' };
      }
      if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(order.status)) {
        throw { status: 400, message: `Cannot process payment. Order is already in ${order.status} state.` };
      }

      // Fetch active reservations for this order
      const reservationsRes = await client.query(
        'SELECT * FROM reservations WHERE order_id = $1 AND status = $2 FOR UPDATE',
        [orderId, 'ACTIVE']
      );

      const paymentId = uuidv4();
      let paymentRecord = null;
      let orderStatusResult = '';

      if (cleanOutcome === 'SUCCESS') {
        // SUCCESS:
        // Mark order as PAID
        await client.query(
          `UPDATE orders SET status = 'PAID', updated_at = NOW() WHERE id = $1`,
          [orderId]
        );

        // Mark reservations as COMPLETED and clear reserved_stock
        for (const res of reservationsRes.rows) {
          await client.query(
            `UPDATE reservations SET status = 'COMPLETED' WHERE id = $1`,
            [res.id]
          );
          // Stock was already removed from available_stock at checkout; now clear reserved_stock
          await client.query(
            `UPDATE products 
             SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = NOW()
             WHERE id = $2`,
            [res.quantity, res.product_id]
          );
        }

        const payRes = await client.query(
          `INSERT INTO payments (id, order_id, idempotency_key, amount, outcome, status, gateway_response, created_at)
           VALUES ($1, $2, $3, $4, 'SUCCESS', 'PAID', $5, NOW())
           RETURNING *`,
          [paymentId, orderId, finalIdempotencyKey, order.total_amount, JSON.stringify({ message: 'Payment approved', transactionId: 'TXN-' + Date.now() })]
        );

        paymentRecord = payRes.rows[0];
        orderStatusResult = 'PAID';

      } else if (cleanOutcome === 'FAILED') {
        // FAILED:
        // Mark order as FAILED
        await client.query(
          `UPDATE orders SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
          [orderId]
        );

        // Release stock back to available inventory
        for (const res of reservationsRes.rows) {
          await client.query(
            `UPDATE reservations SET status = 'RELEASED' WHERE id = $1`,
            [res.id]
          );
          await client.query(
            `UPDATE products 
             SET available_stock = available_stock + $1,
                 reserved_stock = GREATEST(0, reserved_stock - $1),
                 updated_at = NOW()
             WHERE id = $2`,
            [res.quantity, res.product_id]
          );
        }

        const payRes = await client.query(
          `INSERT INTO payments (id, order_id, idempotency_key, amount, outcome, status, gateway_response, created_at)
           VALUES ($1, $2, $3, $4, 'FAILED', 'FAILED', $5, NOW())
           RETURNING *`,
          [paymentId, orderId, finalIdempotencyKey, order.total_amount, JSON.stringify({ error: 'Card declined / Insufficient funds', code: 'PAYMENT_DECLINED' })]
        );

        paymentRecord = payRes.rows[0];
        orderStatusResult = 'FAILED';

      } else if (cleanOutcome === 'TIMEOUT') {
        // TIMEOUT:
        // Mark order as EXPIRED
        await client.query(
          `UPDATE orders SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
          [orderId]
        );

        // Release stock immediately due to timeout
        for (const res of reservationsRes.rows) {
          await client.query(
            `UPDATE reservations SET status = 'EXPIRED' WHERE id = $1`,
            [res.id]
          );
          await client.query(
            `UPDATE products 
             SET available_stock = available_stock + $1,
                 reserved_stock = GREATEST(0, reserved_stock - $1),
                 updated_at = NOW()
             WHERE id = $2`,
            [res.quantity, res.product_id]
          );
        }

        const payRes = await client.query(
          `INSERT INTO payments (id, order_id, idempotency_key, amount, outcome, status, gateway_response, created_at)
           VALUES ($1, $2, $3, $4, 'TIMEOUT', 'TIMEOUT', $5, NOW())
           RETURNING *`,
          [paymentId, orderId, finalIdempotencyKey, order.total_amount, JSON.stringify({ error: 'Payment gateway timed out. Reservation expired.', code: 'GATEWAY_TIMEOUT' })]
        );

        paymentRecord = payRes.rows[0];
        orderStatusResult = 'EXPIRED';
      }

      await client.query('COMMIT');

      return {
        success: cleanOutcome === 'SUCCESS',
        orderId,
        orderStatus: orderStatusResult,
        outcome: cleanOutcome,
        payment: paymentRecord
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel an order and restore stock.
   * If the order was PAID, also simulates a full refund.
   */
  async cancelOrder(orderId) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );

      if (orderRes.rows.length === 0) {
        throw { status: 404, message: `Order #${orderId} not found.` };
      }

      const order = orderRes.rows[0];

      if (order.status === 'CANCELLED') {
        await client.query('COMMIT');
        return { message: 'Order is already cancelled.', order };
      }

      const itemsRes = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [orderId]
      );

      if (order.status === 'RESERVED') {
        // If it was reserved, restore stock from reserved_stock
        for (const item of itemsRes.rows) {
          await client.query(
            `UPDATE products 
             SET available_stock = available_stock + $1,
                 reserved_stock = GREATEST(0, reserved_stock - $1),
                 updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.product_id]
          );
        }
        await client.query(
          `UPDATE reservations SET status = 'RELEASED' WHERE order_id = $1 AND status = 'ACTIVE'`,
          [orderId]
        );
      } else if (order.status === 'PAID') {
        // If it was paid, restore available_stock and log simulated refund
        for (const item of itemsRes.rows) {
          await client.query(
            `UPDATE products 
             SET available_stock = available_stock + $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.product_id]
          );
        }

        // Record refund
        await client.query(
          `INSERT INTO payments (id, order_id, idempotency_key, amount, outcome, status, gateway_response, created_at)
           VALUES ($1, $2, $3, $4, 'SUCCESS', 'PAID', $5, NOW())`,
          [uuidv4(), orderId, `REFUND-${orderId}-${Date.now()}`, -Number(order.total_amount), JSON.stringify({ refund: true, reason: 'Customer requested order cancellation' })]
        );
      }

      // Mark order CANCELLED
      const updatedOrder = await client.query(
        `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [orderId]
      );

      await client.query('COMMIT');

      return {
        message: 'Order successfully cancelled and stock restored to inventory.',
        order: updatedOrder.rows[0],
        refundIssued: order.status === 'PAID'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new PaymentService();
