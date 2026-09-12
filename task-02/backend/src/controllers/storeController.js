const catalogService = require('../services/catalogService');
const checkoutService = require('../services/checkoutService');
const paymentService = require('../services/paymentService');

exports.getProducts = async (req, res, next) => {
  try {
    const { search, category, minPrice, maxPrice, inStock } = req.query;
    const products = await catalogService.searchProducts({ search, category, minPrice, maxPrice, inStock });
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    next(err);
  }
};

exports.getCategories = async (req, res, next) => {
  try {
    const categories = await catalogService.getCategories();
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
};

exports.getProductDetails = async (req, res, next) => {
  try {
    const product = await catalogService.getProductByIdOrSlug(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

exports.checkout = async (req, res, next) => {
  try {
    const { items, customerName, customerEmail, shippingAddress, idempotencyKey } = req.body;
    const result = await checkoutService.reserveAndCheckout({
      items,
      customerName,
      customerEmail,
      shippingAddress,
      idempotencyKey
    });

    res.status(201).json({
      success: true,
      message: 'Checkout initialized. Stock reserved for 5 minutes.',
      data: result
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, code: err.code || 'CHECKOUT_ERROR', message: err.message });
    }
    next(err);
  }
};

exports.processPayment = async (req, res, next) => {
  try {
    const { orderId, outcome, idempotencyKey } = req.body;
    const result = await paymentService.processPayment({ orderId, outcome, idempotencyKey });

    if (result.duplicate) {
      return res.status(200).json({ success: true, duplicate: true, message: result.message, data: result.payment });
    }

    res.status(result.success ? 200 : 400).json({
      success: result.success,
      outcome: result.outcome,
      orderStatus: result.orderStatus,
      data: result.payment
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

exports.getOrders = async (req, res, next) => {
  try {
    const { email } = req.query;
    const orders = await checkoutService.getOrdersByEmail(email);
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    const order = await checkoutService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await paymentService.cancelAndRefund(req.params.id, reason);
    res.json({ success: true, message: result.message, data: result.order, refundIssued: result.refundIssued });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};
