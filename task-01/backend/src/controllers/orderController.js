const inventoryService = require('../services/inventoryService');
const paymentService = require('../services/paymentService');
const reservationWorker = require('../services/reservationWorker');

exports.createOrder = async (req, res, next) => {
  try {
    const { items, customerName, customerEmail, idempotencyKey } = req.body;

    const result = await inventoryService.reserveAndCreateOrder({
      items,
      customerName,
      customerEmail,
      idempotencyKey
    });

    res.status(result.isDuplicate ? 200 : 201).json({
      success: true,
      message: result.isDuplicate ? 'Existing order retrieved (idempotency key matched).' : 'Order created and stock reserved for 5 minutes.',
      data: result
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        code: err.code || 'BAD_REQUEST',
        message: err.message
      });
    }
    next(err);
  }
};

exports.getOrder = async (req, res, next) => {
  try {
    const order = await inventoryService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

exports.getAllOrders = async (req, res, next) => {
  try {
    const orders = await inventoryService.getAllOrders();
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const result = await paymentService.cancelOrder(req.params.id);
    res.json({
      success: true,
      message: result.message,
      data: result.order,
      refundIssued: result.refundIssued
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

exports.forceExpireOrder = async (req, res, next) => {
  try {
    await reservationWorker.forceExpireOrder(req.params.id);
    const updated = await inventoryService.getOrderById(req.params.id);
    res.json({
      success: true,
      message: 'Reservation forcibly expired for testing; stock returned to available inventory.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
};
