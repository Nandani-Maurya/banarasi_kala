const crypto = require('crypto');
const { config } = require('../config/env');
const { createOrder: razorpayCreateOrder } = require('../services/RazorpayService');

class RazorpayController {
  async createOrder(req, res) {
    try {
      const amount = Number(req.body.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Valid amount is required.' });
      }
      if (amount < 1) {
        return res.status(400).json({ message: 'Online payment amount must be at least Rs. 1.' });
      }

      const order = await razorpayCreateOrder(amount);

      return res.status(200).json(order);
    } catch (error) {
      console.error('[Razorpay] createOrder error:', error?.message || error);
      return res.status(500).json({ message: 'Unable to start online payment.' });
    }
  }

  async verifyPayment(req, res) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment verification details are missing.' });
      }

      const expectedSign = crypto
        .createHmac('sha256', config.razorpayKeySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSign !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment verification failed.' });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Razorpay] verifyPayment error:', error?.message || error);
      return res.status(500).json({ success: false, message: 'Unable to verify payment.' });
    }
  }
}

module.exports = new RazorpayController();
