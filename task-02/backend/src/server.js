const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const { initDb, isInMemory } = require('./config/db');
const reservationWorker = require('./services/reservationWorker');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'Techloom E-Commerce Checkout & Payment System',
    version: '1.0.0',
    databaseEngine: isInMemory() ? 'In-Memory PostgreSQL' : 'PostgreSQL Cloud/Local',
    timestamp: new Date().toISOString(),
    endpoints: {
      products: '/api/products',
      categories: '/api/products/categories',
      checkout: 'POST /api/checkout',
      payment: 'POST /api/payments/process',
      orders: '/api/orders'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
  console.error('[Error Handler]', err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred.'
  });
});

async function startServer() {
  try {
    await initDb();
    reservationWorker.start(5000);

    const server = app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` E-Commerce Backend System running on port ${PORT}`);
      console.log(` Health Check: http://localhost:${PORT}/health`);
      console.log(` Database Engine: ${isInMemory() ? 'In-Memory PostgreSQL (Mock Mode)' : 'Live PostgreSQL'}`);
      console.log(`====================================================`);
    });

    const shutdown = () => {
      console.log('\nShutting down E-commerce server...');
      reservationWorker.stop();
      server.close(() => {
        console.log('Server closed cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
  } catch (err) {
    console.error('Failed to start E-Commerce server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
