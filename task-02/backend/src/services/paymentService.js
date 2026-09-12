const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class PaymentService {
  async processPayment({ orderId, outcome = 'SUCCESS', idempotencyKey }) {
    if (!orderId) throw { status: 400, message: 'Order ID is required.' };

    const cleanOutcome = outcome.toUpperCase();
    const finalIdempotencyKey = idempotencyKey || `ECOMM-PAY-${orderId}-${Date.now()}`;

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Check duplicate payment
      const existingPay = await client.query('SELECT * FROM payments WHERE idempotency_key = $1', [finalIdempotencyKey]);
      if (existingPay.rows.length > 0) {
        await client.query('COMMIT');
        return { duplicate: true, payment: existingPay.rows[0], message: 'Duplicate payment request detected and rejected.' };
      }

      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) throw { status: 404, message: 'Order not found.' };

      const order = orderRes.rows[0];
      if (order.status === 'PAID') throw { status: 400, message: 'Order is already paid.' };
      if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(order.status)) {
        throw { status: 400, message: `Cannot process payment on ${order.status} order.` };
      }

      const reservations = await client.query('SELECT * FROM reservations WHERE order_id = $1 AND status = $2', [orderId, 'ACTIVE']);
      const paymentId = uuidv4();
      let paymentRecord = null;
      let orderStatusResult = '';

      if (cleanOutcome === 'SUCCESS') {
        await client.query(`UPDATE orders SET status = 'PAID', updated_at = NOW() WHERE id = $1`, [orderId]);

        for (const res of reservations.rows) {
          await client.query(`UPDATE reservations SET status = 'COMPLETED' WHERE id = $1`, [res.id]);
          await client.query(
            `UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = NOW() WHERE id = $2`,
            [res.quantity, res.product_id]
          );
        }

        const payRes = await client.query(
          `INSERT INTO payments (id, order_id, idempotency_key, amount, outcome, status, gateway_response, created_at)
           VALUES ($1, $2, $3, $4, 'SUCCESS', 'PAID', $5, NOW())
           RETURNING *`,
          [paymentId, orderId, finalIdempotencyKey, order.total_amount, JSON.stringify({ transactionId: 'TXN-' + Date.now(), card: '•••• 4242' })]
        );
        paymentRecord = payRes.rows[0];
        orderStatusResult = 'PAID';

      } else if (cleanOutcome === 'FAILED') {
        await client.query(`UPDATE orders SET status = 'FAILED', updated_at = NOW() WHERE id = $1`, [orderId]);

        for (const res of reservations.rows) {
          await client.query(`UPDATE reservations SET status = 'RELEASED' WHERE id = $1`, [res.id]);
          await client.query(
            `UPDATE products SET available_stock = available_stock + $1, reserved_stock = GREATEST(0, reserved_stock - $1) WHERE id = $2`,
            [res.quantity, res.product_id]
          );
        }

        const payRes = await client.query(
          `INSERT INTO payments (id, order_id, idempotency_key, amount, outcome, status, gateway_response, created_at)
           VALUES ($1, $2, $3, $4, 'FAILED', 'FAILED', $5, NOW())
           RETURNING *`,
          [paymentId, orderId, finalIdempotencyKey, order.total_amount, JSON.stringify({ error: 'Card declined / Insufficient funds' })]
        );
        paymentRecord = payRes.rows[0];
        orderStatusResult = 'FAILED';

      } else if (cleanOutcome === 'TIMEOUT') {
        await client.query(`UPDATE orders SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`, [orderId]);

        for (const res of reservations.rows) {
          await client.query(`UPDATE reservations SET status = 'EXPIRED' WHERE id = $1`, [res.id]);
          await client.query(
            `UPDATE products SET available_stock = available_stock + $1, reserved_stock = GREATEST(0, reserved_stock - $1) WHERE id = $2`,
            [res.quantity, res.product_id]
          );
        }

        const payRes = await client.query(
          `INSERT INTO payments (id, order_id, idempotency_key, amount, outcome, status, gateway_response, created_at)
           VALUES ($1, $2, $3, $4, 'TIMEOUT', 'TIMEOUT', $5, NOW())
           RETURNING *`,
          [paymentId, orderId, finalIdempotencyKey, order.total_amount, JSON.stringify({ error: 'Gateway timeout during 3D-Secure check' })]
        );
        paymentRecord = payRes.rows[0];
        orderStatusResult = 'EXPIRED';
      }

      await client.query('COMMIT');

      return {
        success: cleanOutcome === 'SUCCESS',
        outcome: cleanOutcome,
        orderStatus: orderStatusResult,
        payment: paymentRecord
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async cancelAndRefund(orderId, reason = 'Customer request') {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) throw { status: 404, message: 'Order not found.' };

      const order = orderRes.rows[0];
      if (order.status === 'CANCELLED') {
        await client.query('COMMIT');
        return { message: 'Order is already cancelled.', order };
      }

      const items = await client.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);

      // Restore stock
      for (const item of items.rows) {
        await client.query(
          `UPDATE products SET available_stock = available_stock + $1, updated_at = NOW() WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }

      let refundIssued = false;
      if (order.status === 'PAID') {
        refundIssued = true;
        await client.query(
          `INSERT INTO payments (id, order_id, idempotency_key, amount, outcome, status, refund_amount, gateway_response, created_at)
           VALUES ($1, $2, $3, $4, 'SUCCESS', 'PAID', $5, $6, NOW())`,
          [
            uuidv4(),
            orderId,
            `REFUND-${orderId}-${Date.now()}`,
            -Number(order.total_amount),
            Number(order.total_amount),
            JSON.stringify({ refund: true, reason, transactionId: 'REF-' + Date.now() })
          ]
        );
      }

      const updated = await client.query(
        `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [orderId]
      );

      await client.query('COMMIT');

      return {
        message: 'Order successfully cancelled, stock restored, and refund processed.',
        order: updated.rows[0],
        refundIssued
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
