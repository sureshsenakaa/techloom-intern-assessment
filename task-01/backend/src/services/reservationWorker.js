const db = require('../config/db');

class ReservationWorker {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
  }

  start(intervalMs = 5000) {
    if (this.intervalId) return;

    console.log(`[Worker] Stock Reservation Expiry Worker started (polling every ${intervalMs / 1000}s)...`);
    this.intervalId = setInterval(() => this.processExpiredReservations(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Worker] Stock Reservation Expiry Worker stopped.');
    }
  }

  /**
   * Scans for active reservations past their 5-minute TTL,
   * releases reserved stock back to available stock,
   * and transitions order status to EXPIRED.
   */
  async processExpiredReservations() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const expiredRes = await db.query(
        `SELECT id, order_id, product_id, quantity 
         FROM reservations 
         WHERE status = 'ACTIVE' AND expires_at <= NOW()`
      );

      if (expiredRes.rows.length === 0) {
        this.isProcessing = false;
        return;
      }

      console.log(`[Worker] Found ${expiredRes.rows.length} expired reservation(s). Releasing stock back to inventory...`);

      for (const res of expiredRes.rows) {
        const client = await db.getClient();
        try {
          await client.query('BEGIN');

          // Mark reservation as EXPIRED
          await client.query(
            `UPDATE reservations SET status = 'EXPIRED' WHERE id = $1 AND status = 'ACTIVE'`,
            [res.id]
          );

          // Restore product stock: increase available_stock, decrease reserved_stock
          await client.query(
            `UPDATE products 
             SET available_stock = available_stock + $1,
                 reserved_stock = GREATEST(0, reserved_stock - $1),
                 updated_at = NOW()
             WHERE id = $2`,
            [res.quantity, res.product_id]
          );

          // Transition order status to EXPIRED if still in RESERVED state
          await client.query(
            `UPDATE orders 
             SET status = 'EXPIRED', updated_at = NOW()
             WHERE id = $1 AND status = 'RESERVED'`,
            [res.order_id]
          );

          await client.query('COMMIT');
          console.log(`[Worker] Released ${res.quantity} unit(s) of product #${res.product_id} for order ${res.order_id} (Expired).`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[Worker] Error releasing reservation #${res.id}:`, err.message);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error('[Worker] Expiry worker check failed:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Helper to manually expire an order's reservation immediately (useful for testing timeout).
   */
  async forceExpireOrder(orderId) {
    await db.query(
      `UPDATE reservations SET expires_at = NOW() - INTERVAL '1 second' WHERE order_id = $1 AND status = 'ACTIVE'`,
      [orderId]
    );
    await this.processExpiredReservations();
  }
}

module.exports = new ReservationWorker();
