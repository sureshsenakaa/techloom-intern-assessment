const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const { initDb, isInMemory } = require('./config/db');
const reservationWorker = require('./services/reservationWorker');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health & System Info
app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'Techloom POS Order & Inventory System',
    version: '1.0.0',
    databaseEngine: isInMemory() ? 'In-Memory PostgreSQL' : 'PostgreSQL Cloud/Local',
    timestamp: new Date().toISOString(),
    endpoints: {
      products: '/api/products',
      checkout: 'POST /api/orders/checkout',
      orders: '/api/orders',
      mockPayment: 'POST /api/payments/mock'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// API Routes
app.use('/api', apiRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Error Handler]', err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected server error occurred.'
  });
});

// Start Server
async function startServer() {
  try {
    await initDb();
    reservationWorker.start(5000); // Check for expired reservations every 5s

    const server = app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` POS Order & Inventory System running on port ${PORT}`);
      console.log(` Health Check: http://localhost:${PORT}/health`);
      console.log(` Database Engine: ${isInMemory() ? 'In-Memory PostgreSQL (Mock Mode)' : 'Live PostgreSQL'}`);
      console.log(`====================================================`);
    });

    const shutdown = () => {
      console.log('\nShutting down server...');
      reservationWorker.stop();
      server.close(() => {
        console.log('Server terminated cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
