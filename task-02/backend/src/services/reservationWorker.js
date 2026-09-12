const db = require('../config/db');

class ReservationWorker {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
  }

  start(intervalMs = 5000) {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.processExpiredReservations(), intervalMs);
    console.log(`[E-Commerce Worker] Reservation Expiry Worker active (polling every ${intervalMs / 1000}s)...`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

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

      for (const res of expiredRes.rows) {
        const client = await db.getClient();
        try {
          await client.query('BEGIN');

          await client.query(
            `UPDATE reservations SET status = 'EXPIRED' WHERE id = $1 AND status = 'ACTIVE'`,
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

          await client.query(
            `UPDATE orders 
             SET status = 'EXPIRED', updated_at = NOW()
             WHERE id = $1 AND status = 'RESERVED'`,
            [res.order_id]
          );

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('[E-Commerce Worker] Error releasing expired reservation:', err.message);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error('[E-Commerce Worker] Worker check failed:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new ReservationWorker();
