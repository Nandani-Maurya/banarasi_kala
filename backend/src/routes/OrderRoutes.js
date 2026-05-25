const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/OrderController');
const { authMiddleware, optionalAuthMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// Checkout route. Logged-in customers are linked by user id; guests remain supported.
router.post('/', optionalAuthMiddleware, OrderController.createOrder);

// Customer-facing My Orders page. Uses logged-in customer id, not email.
router.get('/my', authMiddleware, OrderController.getCurrentCustomerOrders);

// Legacy route kept for old clients, but protected and resolved by logged-in user id.
router.get('/my/:email', authMiddleware, OrderController.getCurrentCustomerOrders);

// Live tracking by order ID (fetches ShipRocket tracking data)
router.get('/track/:orderId', authMiddleware, OrderController.trackOrder);

// Single customer order detail. Uses logged-in customer id.
router.get('/:id', authMiddleware, OrderController.getCustomerOrderById);

// Customer cancellation: allowed within 24 hours, also attempts ShipRocket cancel.
router.post('/:id/cancel', authMiddleware, OrderController.cancelOrder);

// Admin/order lookup route.
router.get('/', OrderController.getMyOrders);

// Admin: Update status (e.g., Delivered). Triggers referral reward scheduling.
router.patch('/:id/status', authMiddleware, adminMiddleware, OrderController.updateOrderStatus);

module.exports = router;
