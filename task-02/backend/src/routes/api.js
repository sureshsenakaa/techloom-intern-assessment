const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');

// Catalog & Product Discovery
router.get('/products', storeController.getProducts);
router.get('/products/categories', storeController.getCategories);
router.get('/products/:id', storeController.getProductDetails);

// Cart & Checkout (Stock reservation)
router.post('/checkout', storeController.checkout);

// Mock Payment Gateway
router.post('/payments/process', storeController.processPayment);

// Post-Purchase: Order History & Refund/Cancellation
router.get('/orders', storeController.getOrders);
router.get('/orders/:id', storeController.getOrderById);
router.post('/orders/:id/cancel', storeController.cancelOrder);

module.exports = router;
