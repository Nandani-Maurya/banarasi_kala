const express = require('express');
const router = express.Router();
const ShipRocketController = require('../controllers/ShipRocketController');
const { authMiddleware } = require('../middleware/authMiddleware');

// All ShipRocket routes are admin-only in production.
// Add your admin auth middleware here when ready:
// const { requireAdmin } = require('../middleware/auth');
// router.use(requireAdmin);

/**
 * POST /api/shiprocket/push-order
 * Body: { orderId: number, autoAssignCourier?: boolean }
 * Push a VNS Saree order to ShipRocket and optionally auto-assign AWB.
 */
router.post('/push-order', ShipRocketController.pushOrder);

/**
 * POST /api/shiprocket/assign-awb
 * Body: { shipment_id: string, courier_id?: string }
 * Manually assign a courier and generate AWB.
 */
router.post('/assign-awb', ShipRocketController.assignAWB);

/**
 * POST /api/shiprocket/generate-label
 * Body: { shipment_ids: string[] }
 * Returns a PDF label URL.
 */
router.post('/generate-label', ShipRocketController.generateLabel);

/**
 * POST /api/shiprocket/generate-manifest
 * Body: { shipment_ids: string[] }
 * Returns a manifest PDF URL.
 */
router.post('/generate-manifest', ShipRocketController.generateManifest);

/**
 * POST /api/shiprocket/schedule-pickup
 * Body: { shipment_ids: string[] }
 * Schedule a courier pickup.
 */
router.post('/schedule-pickup', ShipRocketController.schedulePickup);

/**
 * POST /api/shiprocket/cancel
 * Body: { shiprocket_order_ids: string[] }
 * Cancel orders on ShipRocket.
 */
router.post('/cancel', ShipRocketController.cancelOrders);

/**
 * GET /api/shiprocket/track/awb/:awb
 * Track a shipment by AWB number.
 */
router.get('/track/awb/:awb', ShipRocketController.trackByAWB);

/**
 * GET /api/shiprocket/track/order/:orderId
 * Track a shipment using the VNS Order ID (DB lookup).
 */
router.get('/track/order/:orderId', ShipRocketController.trackByOrderId);

/**
 * GET /api/shiprocket/serviceability?pincode=123456
 * Check which couriers serve a given pincode.
 */
router.get('/serviceability', ShipRocketController.checkServiceability);

/**
 * POST /api/shiprocket/create-return
 * Body: { orderId: number }
 * Initiate return shipment on ShipRocket.
 */
router.post('/create-return', authMiddleware, ShipRocketController.createReturn);
router.post('/create-exchange', authMiddleware, ShipRocketController.createExchange);
router.post('/cancel-return', authMiddleware, ShipRocketController.cancelReturn);
router.post('/cancel-exchange', authMiddleware, ShipRocketController.cancelExchange);

/**
 * POST /api/shiprocket/webhook
 * ShipRocket webhook for shipment status updates.
 */
router.post('/webhook', ShipRocketController.webhook);

module.exports = router;
