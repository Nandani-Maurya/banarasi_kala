const ShipRocketService = require('../services/ShipRocketService');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const EmailService = require('../services/EmailService');
const { config } = require('../config/env');

const mapShiprocketStatus = (value = '') => {
  const status = String(value || '').toLowerCase();
  if (status.includes('delivered')) return 'Delivered';
  if (status.includes('out for delivery')) return 'Out For Delivery';
  if (status.includes('shipped') || status.includes('pickup') || status.includes('manifest') || status.includes('in transit')) return 'Shipped';
  if (status.includes('cancel')) return 'Cancelled';
  if (status.includes('return')) return 'Return Initiated';
  return null;
};

class ShipRocketController {

  // ── Push a VNS order to ShipRocket and (optionally) auto-assign AWB ──────────
  async pushOrder(req, res) {
    try {
      const { orderId, autoAssignCourier = true } = req.body;

      if (!orderId) return res.status(400).json({ message: 'orderId is required' });

      // Fetch order + items from DB
      const order = await Order.findByPk(orderId, { include: [OrderItem] });
      if (!order) return res.status(404).json({ message: 'Order not found' });

      // Map OrderItems to a flat items array with name fallback
      const items = order.OrderItems.map(oi => ({
        product_id: oi.product_id,
        quantity: oi.quantity,
        price: oi.price,
        name: oi.product_name || `Product #${oi.product_id}`,
      }));

      // Step 1: Create order on ShipRocket
      const srOrder = await ShipRocketService.createOrder({ order, items });
      const shipmentId = srOrder.shipment_id;
      const srOrderId = srOrder.order_id;

      let awbData = null;

      // Step 2 (optional): Auto-assign AWB
      if (autoAssignCourier && shipmentId) {
        awbData = await ShipRocketService.assignAWB(shipmentId);
      }

      // Persist shiprocket_order_id + awb on the local order record if columns exist
      try {
        const updatePayload = { shiprocket_order_id: srOrderId };
        if (awbData?.response?.data?.awb_code) {
          updatePayload.shiprocket_awb = awbData.response.data.awb_code;
        }
        await order.update(updatePayload);
      } catch (_) {
        // Columns may not exist yet — ignore silently
      }

      return res.status(200).json({
        message: 'Order pushed to ShipRocket successfully',
        shiprocket_order_id: srOrderId,
        shipment_id: shipmentId,
        awb: awbData?.response?.data?.awb_code || null,
      });
    } catch (error) {
      console.error('[ShipRocket] pushOrder error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to push order to ShipRocket',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Assign / reassign AWB for an existing ShipRocket shipment ────────────────
  async assignAWB(req, res) {
    try {
      const { shipment_id, courier_id } = req.body;
      if (!shipment_id) return res.status(400).json({ message: 'shipment_id is required' });

      const data = await ShipRocketService.assignAWB(shipment_id, courier_id || null);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[ShipRocket] assignAWB error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to assign AWB',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Generate shipping label (returns label PDF URL) ──────────────────────────
  async generateLabel(req, res) {
    try {
      const { shipment_ids } = req.body;
      if (!shipment_ids || !shipment_ids.length) {
        return res.status(400).json({ message: 'shipment_ids array is required' });
      }
      const data = await ShipRocketService.generateLabel(shipment_ids);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[ShipRocket] generateLabel error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to generate label',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Generate manifest PDF ────────────────────────────────────────────────────
  async generateManifest(req, res) {
    try {
      const { shipment_ids } = req.body;
      if (!shipment_ids || !shipment_ids.length) {
        return res.status(400).json({ message: 'shipment_ids array is required' });
      }
      const data = await ShipRocketService.generateManifest(shipment_ids);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[ShipRocket] generateManifest error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to generate manifest',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Track by AWB ─────────────────────────────────────────────────────────────
  async trackByAWB(req, res) {
    try {
      const { awb } = req.params;
      if (!awb) return res.status(400).json({ message: 'awb is required' });

      const data = await ShipRocketService.trackByAWB(awb);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[ShipRocket] trackByAWB error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to fetch tracking info',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Track by VNS Order ID (looks up shiprocket_order_id from DB) ─────────────
  async trackByOrderId(req, res) {
    try {
      const { orderId } = req.params;
      const order = await Order.findByPk(orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      if (!order.shiprocket_order_id) {
        return res.status(400).json({ message: 'This order has not been pushed to ShipRocket yet' });
      }

      const data = await ShipRocketService.trackByOrderId(order.shiprocket_order_id);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[ShipRocket] trackByOrderId error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to fetch tracking info',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Schedule pickup ───────────────────────────────────────────────────────────
  async schedulePickup(req, res) {
    try {
      const { shipment_ids } = req.body;
      if (!shipment_ids || !shipment_ids.length) {
        return res.status(400).json({ message: 'shipment_ids array is required' });
      }
      const data = await ShipRocketService.schedulePickup(shipment_ids);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[ShipRocket] schedulePickup error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to schedule pickup',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Cancel ShipRocket orders ─────────────────────────────────────────────────
  async cancelOrders(req, res) {
    try {
      const { shiprocket_order_ids } = req.body;
      if (!shiprocket_order_ids || !shiprocket_order_ids.length) {
        return res.status(400).json({ message: 'shiprocket_order_ids array is required' });
      }
      const data = await ShipRocketService.cancelOrders(shiprocket_order_ids);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[ShipRocket] cancelOrders error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to cancel ShipRocket orders',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Check serviceability for a pincode ───────────────────────────────────────
  async checkServiceability(req, res) {
    try {
      const { pincode, shipment_id, weight = 0.5, is_cod = false } = req.query;
      if (!pincode) return res.status(400).json({ message: 'pincode is required' });

      const codFlag = is_cod === 'true' || is_cod === true || is_cod === 1 || is_cod === '1';
      const data = await ShipRocketService.getServiceableCouries(
        shipment_id, 
        pincode, 
        parseFloat(weight) || 0.5, 
        codFlag
      );
      return res.status(200).json(data);
    } catch (error) {
      console.error('[ShipRocket] serviceability error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to check serviceability',
        detail: error?.response?.data || error.message,
      });
    }
  }

  // ── Create return shipment on ShipRocket ─────────────────────────────────────
  async createReturn(req, res) {
    try {
      const { orderId, reason } = req.body;
      if (!orderId) return res.status(400).json({ message: 'orderId is required' });

      // Fetch order + items from DB
      const order = await Order.findByPk(orderId, { include: [OrderItem] });
      if (!order) return res.status(404).json({ message: 'Order not found' });
      const isOwnedByCustomerId = Number(order.customer_id) === Number(req.user?.id);
      const isLegacyOwnedByEmail = !order.customer_id
        && req.user?.email
        && String(order.customer_email || '').toLowerCase() === String(req.user.email).toLowerCase();
      if (req.userRole !== 'admin' && !isOwnedByCustomerId && !isLegacyOwnedByEmail) {
        return res.status(403).json({ message: 'This order does not belong to this customer.' });
      }
      if (String(order.status).toLowerCase() !== 'delivered') {
        return res.status(400).json({ message: 'Return is allowed only after delivery' });
      }
      if (order.return_requested_at) {
        return res.status(400).json({ message: 'Return has already been requested for this order.' });
      }
      if (order.exchange_requested_at) {
        return res.status(400).json({ message: 'Exchange already used. Return is not available after exchange.' });
      }
      if (!order.delivered_at) {
        return res.status(400).json({ message: 'Return window cannot be evaluated for this order' });
      }
      const returnWindowDays = 7;
      const returnLastDate = new Date(order.delivered_at);
      returnLastDate.setDate(returnLastDate.getDate() + returnWindowDays);
      if (new Date() > returnLastDate) {
        return res.status(400).json({ message: 'Return window expired' });
      }

      const items = order.OrderItems.map(oi => ({
        product_id: oi.product_id,
        quantity: oi.quantity,
        price: oi.price,
        name: oi.product_name || `Product #${oi.product_id}`,
      }));

      const data = await ShipRocketService.createReturnOrder({ order, items, reason });

      // Update local order status
      const logisticsDeduction = order.OrderItems.reduce((sum, item) => {
        const rules = item.shipping_meta?.refund_rules || {};
        return sum
          + Number(rules.return_delivery_deduction || 0)
          + Number(rules.return_rto_deduction || 0);
      }, 0);
      const paidAmount = Number(order.payable_amount ?? order.total_amount ?? 0);
      const estimatedRefund = Math.max(0, paidAmount - logisticsDeduction);
      const refundNote = logisticsDeduction > 0
        ? `Return initiated. Estimated refund Rs. ${estimatedRefund.toLocaleString('en-IN')} after Rs. ${logisticsDeduction.toLocaleString('en-IN')} delivery/RTO logistics deduction.`
        : `Return initiated. Estimated refund Rs. ${estimatedRefund.toLocaleString('en-IN')}; no delivery/RTO deduction applies.`;

      await order.update({
        status: `Return Initiated${reason ? `: ${String(reason).slice(0, 120)}` : ''}`,
        return_requested_at: new Date(),
        refund_status: 'Return Refund Pending',
        refund_note: refundNote,
      });

      return res.status(200).json({
        message: 'Return order created on ShipRocket successfully',
        refund_message: refundNote,
        shiprocket_return_order_id: data.order_id,
        shipment_id: data.shipment_id,
        detail: data
      });
    } catch (error) {
      console.error('[ShipRocket] createReturn error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to create return order on ShipRocket',
        detail: error?.response?.data || error.message,
      });
    }
  }

  async createExchange(req, res) {
    try {
      const { orderId, reason } = req.body;
      if (!orderId) return res.status(400).json({ message: 'orderId is required' });

      const order = await Order.findByPk(orderId, { include: [OrderItem] });
      if (!order) return res.status(404).json({ message: 'Order not found' });
      const isOwnedByCustomerId = Number(order.customer_id) === Number(req.user?.id);
      const isLegacyOwnedByEmail = !order.customer_id
        && req.user?.email
        && String(order.customer_email || '').toLowerCase() === String(req.user.email).toLowerCase();
      if (req.userRole !== 'admin' && !isOwnedByCustomerId && !isLegacyOwnedByEmail) {
        return res.status(403).json({ message: 'This order does not belong to this customer.' });
      }
      if (String(order.status).toLowerCase() !== 'delivered') {
        return res.status(400).json({ message: 'Exchange is allowed only after delivery' });
      }
      if (order.exchange_requested_at) {
        return res.status(400).json({ message: 'Exchange has already been requested for this order.' });
      }
      if (order.return_requested_at) {
        return res.status(400).json({ message: 'Return already used. Exchange is not available after return.' });
      }
      if (!order.delivered_at) {
        return res.status(400).json({ message: 'Exchange window cannot be evaluated for this order' });
      }

      const exchangeWindowDays = 7;
      const exchangeLastDate = new Date(order.delivered_at);
      exchangeLastDate.setDate(exchangeLastDate.getDate() + exchangeWindowDays);
      if (new Date() > exchangeLastDate) {
        return res.status(400).json({ message: 'Exchange window expired' });
      }

      const items = order.OrderItems.map(oi => ({
        product_id: oi.product_id,
        quantity: oi.quantity,
        price: oi.price,
        name: oi.product_name || `Product #${oi.product_id}`,
      }));

      const data = await ShipRocketService.createReturnOrder({
        order,
        items,
        reason: `Exchange requested${reason ? `: ${reason}` : ''}`,
      });
      const note = 'Exchange initiated. No delivery or RTO logistics deduction applies for one approved exchange.';

      await order.update({
        status: `Exchange Initiated${reason ? `: ${String(reason).slice(0, 120)}` : ''}`,
        exchange_requested_at: new Date(),
        refund_status: 'Exchange Pending',
        refund_note: note,
      });

      return res.status(200).json({
        message: 'Exchange pickup created on ShipRocket successfully',
        exchange_message: note,
        shiprocket_exchange_order_id: data.order_id,
        shipment_id: data.shipment_id,
        detail: data,
      });
    } catch (error) {
      console.error('[ShipRocket] createExchange error:', error?.response?.data || error.message);
      return res.status(500).json({
        message: 'Failed to create exchange pickup on ShipRocket',
        detail: error?.response?.data || error.message,
      });
    }
  }

  async webhook(req, res) {
    try {
      if (config.shiprocketWebhookSecret) {
        const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-shiprocket-webhook-secret'];
        if (String(providedSecret || '') !== config.shiprocketWebhookSecret) {
          return res.status(401).json({ message: 'Invalid webhook secret' });
        }
      }
      const payload = req.body || {};
      const awb = payload.awb || payload.awb_code || payload.awb_number || payload.shipment?.awb || payload.shipment_track?.awb_code;
      const srOrderId = payload.order_id || payload.shiprocket_order_id || payload.sr_order_id || payload.shipment?.order_id;
      const rawStatus = payload.current_status || payload.shipment_status || payload.status || payload.activity || payload.shipment?.status;
      const nextStatus = mapShiprocketStatus(rawStatus);

      if (!nextStatus || (!awb && !srOrderId)) {
        return res.status(200).json({ message: 'Webhook ignored' });
      }

      const where = awb ? { shiprocket_awb: String(awb) } : { shiprocket_order_id: String(srOrderId) };
      const order = await Order.findOne({ where });
      if (!order) return res.status(200).json({ message: 'Order not found locally' });

      const updatePayload = { status: nextStatus };
      if (nextStatus === 'Delivered' && !order.delivered_at) updatePayload.delivered_at = new Date();
      await order.update(updatePayload);
      EmailService.sendOrderStatusUpdate({ ...order.toJSON(), ...updatePayload }, nextStatus).catch((error) => {
        console.error(`[Email] ShipRocket webhook email failed for order #${order.id}:`, error.message);
      });

      return res.status(200).json({ message: 'Order status synced', orderId: order.id, status: nextStatus });
    } catch (error) {
      console.error('[ShipRocket] webhook error:', error?.response?.data || error.message);
      return res.status(500).json({ message: 'Webhook failed' });
    }
  }
}

module.exports = new ShipRocketController();
