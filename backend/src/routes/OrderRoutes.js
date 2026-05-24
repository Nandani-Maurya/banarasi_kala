const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/OrderController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// Public checkout route.
router.post('/', OrderController.createOrder);

// Get all orders for a specific customer email (customer-facing My Orders page)
router.get('/my/:email', OrderController.getOrdersByEmail);

// Live tracking by order ID (fetches ShipRocket tracking data)
router.get('/track/:orderId', OrderController.trackOrder);

// Customer cancellation: allowed within 24 hours, also attempts ShipRocket cancel.
router.post('/:id/cancel', OrderController.cancelOrder);

// Admin/order lookup route.
router.get('/', OrderController.getMyOrders);

// Admin: Update status (e.g., Delivered). Triggers referral reward scheduling.
router.patch('/:id/status', authMiddleware, adminMiddleware, OrderController.updateOrderStatus);

module.exports = router;
