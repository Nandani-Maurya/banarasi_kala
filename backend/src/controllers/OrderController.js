const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const Color = require('../models/Color');
const Customer = require('../models/Customer');
const { sequelize } = require('../config/db');
const EmailService = require('../services/EmailService');
const ShipRocketService = require('../services/ShipRocketService');
const WalletService = require('../services/WalletService');
const { config } = require('../config/env');
const { Op } = require("sequelize");

const sortProductImages = (images = []) => [...images].sort((a, b) => {
  const left = Number.isFinite(Number(a.display_order)) ? Number(a.display_order) : 999;
  const right = Number.isFinite(Number(b.display_order)) ? Number(b.display_order) : 999;
  return left - right;
});

const pickOrderItemImage = (product, colorId) => {
  const images = Array.isArray(product?.images) ? sortProductImages(product.images) : [];
  if (!images.length) return "";

  const numericColorId = Number(colorId);
  const colorImages = Number.isFinite(numericColorId)
    ? images.filter((image) => Number(image.color_id) === numericColorId)
    : [];
  const coverImages = images.filter((image) => image.is_cover);
  const selected = colorImages[0] || coverImages[0] || images[0];

  return selected?.url || selected?.image_url || "";
};

const serializeOrder = (order) => {
  const json = order.toJSON();
  json.OrderItems = (json.OrderItems || []).map((item) => ({
    id: item.id,
    product_id: item.product_id,
    product_name: item.product_name || item.Product?.name || `Product #${item.product_id}`,
    quantity: item.quantity,
    price: item.price,
    colorId: item.colorId || item.color_id || null,
    color_name: item.Color?.name || null,
    color_hex: item.Color?.hex_code || null,
    image_url: pickOrderItemImage(item.Product, item.colorId || item.color_id),
    product_slug: item.Product?.slug || null,
  }));
  return json;
};

class OrderController {
  async createOrder(req, res) {
    const t = await sequelize.transaction();
    try {
      const { 
        customer_name, customer_email, address, city, state, pincode, phone, 
        total_amount, items, coupon_code, payment_method = 'Prepaid', payment_status = 'Paid'
      } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Order items are required' });
      }

      const productIds = items.map((item) => item.id).filter(Boolean);
      const products = await Product.findAll({ where: { id: productIds }, transaction: t });
      const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
      const missingProductId = productIds.find((id) => !productMap[id]);
      if (missingProductId) {
        return res.status(400).json({ message: `Invalid product in cart: ${missingProductId}` });
      }

      if (String(payment_method).toUpperCase() === 'COD') {
        const prepaidOnly = items.find((item) => {
          const product = productMap[item.id];
          const options = Array.isArray(product?.payment_options) ? product.payment_options : [];
          return !options.includes('cod');
        });
        if (prepaidOnly) {
          return res.status(400).json({ message: `COD is not allowed for product ${prepaidOnly.id}` });
        }
      }

      const customer = customer_email
        ? await Customer.findOne({ where: { email: customer_email }, transaction: t })
        : null;

      let discount_amount = 0;
      let final_total = total_amount;

      if (coupon_code) {
        const Coupon = require('../models/Coupon');
        const coupon = await Coupon.findOne({ where: { code: coupon_code, is_active: true } });
        if (coupon) {
          // Double check validity (simple check here)
          if (coupon.discount_type === 'percentage') {
            discount_amount = (total_amount * coupon.discount_percent) / 100;
            if (coupon.max_discount_amount) {
              discount_amount = Math.min(discount_amount, coupon.max_discount_amount);
            }
          } else {
            discount_amount = coupon.discount_amount;
          }
          final_total = total_amount - discount_amount;
          
          // Increment usage
          await coupon.increment('usage_count', { by: 1, transaction: t });
        }
      }

      const order = await Order.create({
        customer_id: customer?.id || null,
        customer_name,
        customer_email,
        address,
        city,
        state: state || 'Uttar Pradesh',
        pincode,
        phone,
        total_amount: final_total,
        coupon_code,
        discount_amount,
        payment_method,
        payment_status: payment_method === 'COD' ? 'Pending' : payment_status
      }, { transaction: t });

      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.id,
        colorId: item.colorId || item.color_id || null,
        quantity: item.quantity,
        price: item.price,
        product_name: item.name || item.product_name
      }));

      await OrderItem.bulkCreate(orderItems, { transaction: t });

      await t.commit();

      // ── Fire & forget: email confirmation ────────────────────────────────────
      EmailService.sendOrderConfirmation(order, items);

      // ── Fire & forget: push to ShipRocket (never blocks customer response) ──
      (async () => {
        try {
          const srItems = items.map((item, idx) => ({
            product_id: item.id,
            quantity: item.quantity,
            price: item.price,
            name: item.name || item.product_name || `Product ${idx + 1}`,
          }));

          const srResult = await ShipRocketService.createOrder({
            order: { ...order.toJSON(), state: state || 'Uttar Pradesh' },
            items: srItems,
          });

          const updatePayload = {};
          if (srResult?.order_id) updatePayload.shiprocket_order_id = String(srResult.order_id);
          if (srResult?.awb_code) updatePayload.shiprocket_awb = String(srResult.awb_code);
          if (Object.keys(updatePayload).length > 0) {
            await Order.update(updatePayload, { where: { id: order.id } });
          }

          console.log(`[ShipRocket] ✅ Order #${order.id} pushed → SR Order: ${srResult.order_id}, Shipment: ${srResult.shipment_id}`);
        } catch (srErr) {
          // Log but never crash the main order flow
          console.error(`[ShipRocket] ⚠️  Order #${order.id} push failed:`, srErr?.response?.data || srErr.message);
        }
      })();

      res.status(201).json({ message: 'Order placed successfully', orderId: order.id });
    } catch (error) {
      await t.rollback();
      res.status(500).json({ message: error.message });
    }
  }

  async getMyOrders(req, res) {
    try {
      const orders = await Order.findAll({
        include: [{
          model: OrderItem,
          include: [
            { model: Product, attributes: ['id', 'name', 'slug', 'images'] },
            { model: Color, attributes: ['id', 'name', 'hex_code'] },
          ],
        }],
        order: [['createdAt', 'DESC']],
      });
      res.status(200).json(orders.map(serializeOrder));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  // ── Get all orders for a customer email ─────────────────────────────────────
  async getOrdersByEmail(req, res) {
    try {
      const { email } = req.params;
      const orders = await Order.findAll({
        where: { customer_email: email },
        include: [{
          model: OrderItem,
          include: [
            { model: Product, attributes: ['id', 'name', 'slug', 'images'] },
            { model: Color, attributes: ['id', 'name', 'hex_code'] },
          ],
        }],
        order: [['createdAt', 'DESC']],
      });
      res.status(200).json(orders.map(serializeOrder));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  // ── Live tracking via ShipRocket AWB / SR Order ID ──────────────────────────
  async trackOrder(req, res) {
    try {
      const { orderId } = req.params;
      const order = await Order.findByPk(orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      // Try AWB first, fall back to SR order ID
      if (order.shiprocket_awb) {
        const data = await ShipRocketService.trackByAWB(order.shiprocket_awb);
        return res.status(200).json({ source: 'awb', tracking: data });
      }

      if (order.shiprocket_order_id) {
        const data = await ShipRocketService.trackByOrderId(order.shiprocket_order_id);
        return res.status(200).json({ source: 'order_id', tracking: data });
      }

      return res.status(200).json({ source: 'none', message: 'Shipment not yet dispatched' });
    } catch (error) {
      console.error('[Track] Error:', error?.response?.data || error.message);
      res.status(500).json({ message: 'Tracking unavailable', detail: error.message });
    }
  }

  // ── Admin: Update order status. If delivered, schedule referral reward ──────
  async updateOrderStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) return res.status(400).json({ message: 'status is required' });

      const order = await Order.findByPk(id, { transaction: t });
      if (!order) return res.status(404).json({ message: 'Order not found' });

      const normalized = String(status).trim();
      const isDelivered = normalized.toLowerCase() === 'delivered';

      const updatePayload = { status: normalized };
      if (isDelivered && !order.delivered_at) {
        updatePayload.delivered_at = new Date();
      }

      await order.update(updatePayload, { transaction: t });

      // Referral milestone reward:
      // If this is the referred customer's *first* delivered order, and the referrer
      // now has 3 distinct referred customers with delivered orders, credit ₹1000
      // after 7 days from this delivery.
      if (isDelivered && updatePayload.delivered_at && order.customer_id) {
        const buyer = await Customer.findByPk(order.customer_id, { transaction: t });
        if (buyer?.referred_by_id) {
          const priorDelivered = await Order.findOne({
            where: {
              customer_id: buyer.id,
              delivered_at: { [Op.ne]: null },
              id: { [Op.ne]: order.id },
            },
            transaction: t,
          });

          if (!priorDelivered) {
            const referredCustomers = await Customer.findAll({
              where: { referred_by_id: buyer.referred_by_id },
              attributes: ["id"],
              transaction: t,
            });
            const referredCustomerIds = referredCustomers.map((row) => row.id);

            if (referredCustomerIds.length) {
              const qualifiedCount = await Order.count({
                where: {
                  customer_id: { [Op.in]: referredCustomerIds },
                  delivered_at: { [Op.ne]: null },
                },
                distinct: true,
                col: "customer_id",
                transaction: t,
              });

              if (qualifiedCount >= config.referralMilestoneCount) {
                const availableAt = new Date(
                  updatePayload.delivered_at.getTime() + config.referralOrderDelayDays * 24 * 60 * 60 * 1000,
                );
                await WalletService.createPendingCredit({
                  customerId: buyer.referred_by_id,
                  amount: config.referralMilestoneBonus,
                  type: "REFERRAL_MILESTONE_BONUS",
                  dedupeKey: `ref_milestone:${config.referralMilestoneCount}:${buyer.referred_by_id}`,
                  availableAt,
                  meta: {
                    milestone_count: config.referralMilestoneCount,
                    triggering_order_id: order.id,
                    referred_customer_id: buyer.id,
                    qualified_count_at_delivery: qualifiedCount,
                  },
                });
              }
            }
          }
        }
      }

      await t.commit();
      return res.status(200).json({ message: 'Order updated', order });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ message: error.message });
    }
  }
}

module.exports = new OrderController();
