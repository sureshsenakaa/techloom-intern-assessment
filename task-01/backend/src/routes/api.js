const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const orderController = require('../controllers/orderController');
const paymentController = require('../controllers/paymentController');

// Product & Inventory Endpoints
router.get('/products', productController.getProducts);
router.get('/products/:id', productController.getProductById);
router.get('/products/:id/stock', productController.getProductStock);
router.post('/products', productController.createProduct);
router.put('/products/:id', productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);

// Cart & Order Endpoints
router.post('/orders/checkout', orderController.createOrder);
router.get('/orders', orderController.getAllOrders);
router.get('/orders/:id', orderController.getOrder);
router.post('/orders/:id/cancel', orderController.cancelOrder);
router.post('/orders/:id/force-expire', orderController.forceExpireOrder);

// Mock Payment Gateway Endpoints
router.post('/payments/mock', paymentController.processPayment);

module.exports = router;
