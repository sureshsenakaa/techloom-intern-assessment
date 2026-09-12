const paymentService = require('../services/paymentService');

exports.processPayment = async (req, res, next) => {
  try {
    const { orderId, outcome, idempotencyKey } = req.body;

    const result = await paymentService.processPayment({
      orderId,
      outcome: outcome || 'SUCCESS',
      idempotencyKey
    });

    if (result.duplicate) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: result.message,
        data: result.payment
      });
    }

    res.status(result.success ? 200 : 400).json({
      success: result.success,
      outcome: result.outcome,
      orderStatus: result.orderStatus,
      data: result.payment
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
