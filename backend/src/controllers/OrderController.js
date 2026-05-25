const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const Color = require('../models/Color');
const Customer = require('../models/Customer');
const WalletTransaction = require('../models/WalletTransaction');
const { sequelize } = require('../config/db');
const { DataTypes } = require('sequelize');
const EmailService = require('../services/EmailService');
const ShipRocketService = require('../services/ShipRocketService');
const WalletService = require('../services/WalletService');
const { config } = require('../config/env');
const { Op } = require("sequelize");
const { AppError } = require('../utils/http');

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
    shipping_meta: item.shipping_meta || null,
  }));
  return json;
};

let orderAccountingColumnsReady = false;
let orderColumnCache = null;

const ensureOrderAccountingColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const table = { tableName: 'orders', schema: config.dbSchema };
  if (orderAccountingColumnsReady && orderColumnCache) return orderColumnCache;
  const columns = await queryInterface.describeTable(table);
  orderColumnCache = columns;
  orderAccountingColumnsReady = true;
  return columns;
};

const keepExistingColumns = (payload, columns) =>
  Object.fromEntries(Object.entries(payload).filter(([key]) => columns[key]));

let orderItemColumnsReady = false;
let orderItemColumnCache = null;

const ensureOrderItemAccountingColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const table = { tableName: 'order_items', schema: config.dbSchema };
  if (orderItemColumnsReady && orderItemColumnCache) return orderItemColumnCache;
  const columns = await queryInterface.describeTable(table);
  orderItemColumnCache = columns;
  orderItemColumnsReady = true;
  return columns;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getProductWeightKg = (product) => {
  const rawWeight = Number(product?.weight);
  if (!Number.isFinite(rawWeight) || rawWeight <= 0) return 0.5;
  return rawWeight > 5 ? rawWeight / 1000 : rawWeight;
};

const buildItemShippingMeta = ({
  item,
  product,
  allocationWeight,
  allocatedShipping,
  allocatedShippingDiscount,
  shippingDiscountReason,
}) => {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const productWeightKg = getProductWeightKg(product);
  const boxWeightKg = Math.max(0, Number(config.packageWeightKg || 0));
  const effectiveShippingPaid = Math.max(0, allocatedShipping - allocatedShippingDiscount);
  const isFirstOrderFreeShipping = shippingDiscountReason === 'first_order';
  const returnDeliveryDeduction = isFirstOrderFreeShipping ? 0 : allocatedShipping;
  const rtoCharge = isFirstOrderFreeShipping ? 0 : roundMoney(allocatedShipping * Math.max(0, Number(config.rtoChargeMultiplier || 1)));

  return {
    product_weight_kg: roundMoney(productWeightKg),
    box_weight_kg: roundMoney(boxWeightKg),
    quantity,
    allocation_weight_kg: roundMoney(allocationWeight),
    delivery_charge: roundMoney(allocatedShipping),
    delivery_discount: roundMoney(allocatedShippingDiscount),
    delivery_paid: roundMoney(effectiveShippingPaid),
    rto_charge_estimate: rtoCharge,
    refund_rules: {
      free_shipping_reason: shippingDiscountReason || null,
      exchange_delivery_deduction: 0,
      exchange_rto_deduction: 0,
      return_delivery_deduction: roundMoney(returnDeliveryDeduction),
      return_rto_deduction: rtoCharge,
      return_total_logistics_deduction: roundMoney(returnDeliveryDeduction + rtoCharge),
      note: isFirstOrderFreeShipping
        ? 'First-order free shipping: delivery and RTO are not deducted on return.'
        : 'Return refund deducts forward delivery and RTO logistics charges. Exchange has no logistics deduction.',
    },
  };
};

const allocateItemShipping = ({ items, productMap, shippingCharge, shippingDiscount, shippingDiscountReason }) => {
  const lines = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const product = productMap[item.id];
    const productWeightKg = getProductWeightKg(product);
    const allocationWeight = (productWeightKg + Math.max(0, Number(config.packageWeightKg || 0))) * quantity;
    return { item, product, allocationWeight };
  });
  const totalWeight = lines.reduce((sum, line) => sum + line.allocationWeight, 0) || lines.length || 1;
  let remainingShipping = roundMoney(shippingCharge);
  let remainingDiscount = roundMoney(shippingDiscount);

  return lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const allocatedShipping = isLast
      ? remainingShipping
      : roundMoney((shippingCharge * line.allocationWeight) / totalWeight);
    const allocatedDiscount = isLast
      ? remainingDiscount
      : roundMoney((shippingDiscount * line.allocationWeight) / totalWeight);
    remainingShipping = roundMoney(remainingShipping - allocatedShipping);
    remainingDiscount = roundMoney(remainingDiscount - allocatedDiscount);

    return buildItemShippingMeta({
      item: line.item,
      product: line.product,
      allocationWeight: line.allocationWeight,
      allocatedShipping,
      allocatedShippingDiscount: allocatedDiscount,
      shippingDiscountReason,
    });
  });
};

const getColorStockValue = (product, colorId) => {
  const stocks = product?.color_stocks || {};
  return Number(stocks?.[colorId] ?? stocks?.[String(colorId)] ?? product?.stock_quantity ?? 0);
};

const decrementProductInventory = async ({ product, colorId, quantity, transaction }) => {
  const qty = Math.max(1, Number(quantity || 1));
  const stocks = { ...(product.color_stocks || {}) };
  const hasColor = colorId !== null && colorId !== undefined && colorId !== "";
  const currentColorStock = getColorStockValue(product, colorId);
  const currentTotalStock = Number(product.stock_quantity || 0);

  if (currentTotalStock < qty || currentColorStock < qty) {
    throw new AppError(`Only ${Math.max(0, Math.min(currentColorStock, currentTotalStock))} item(s) are available for ${product.name}.`, 400);
  }

  const updatePayload = { stock_quantity: currentTotalStock - qty };
  if (hasColor) {
    stocks[String(colorId)] = currentColorStock - qty;
    updatePayload.color_stocks = stocks;
  }

  await product.update(updatePayload, { transaction });
};

class OrderController {
  async createOrder(req, res) {
    const t = await sequelize.transaction();
    try {
      const { 
        customer_name, customer_email, address, city, state, pincode, phone, 
        subtotal_amount, shipping_charge = 0, shipping_discount = 0, payment_fee = 0, payment_discount = 0,
        shipping_discount_reason = null, total_amount, items, coupon_code, wallet_amount = 0, payment_method = 'Prepaid', payment_status = 'Paid'
      } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        await t.rollback();
        return res.status(400).json({ message: 'Order items are required' });
      }

      const productIds = [...new Set(items.map((item) => item.id).filter(Boolean))];
      const products = await Product.findAll({
        where: { id: productIds },
        attributes: ['id', 'name', 'weight', 'stock_quantity', 'color_stocks', 'status'],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
      const missingProductId = productIds.find((id) => !productMap[id]);
      if (missingProductId) {
        await t.rollback();
        return res.status(400).json({ message: `Invalid product in cart: ${missingProductId}` });
      }
      for (const item of items) {
        const productForStock = productMap[item.id];
        if (productForStock.status !== 'active') {
          await t.rollback();
          return res.status(400).json({ message: `${productForStock.name} is currently unavailable.` });
        }
        await decrementProductInventory({
          product: productForStock,
          colorId: item.colorId || item.color_id || null,
          quantity: item.quantity,
          transaction: t,
        });
      }

      const authenticatedCustomer = req.userRole === 'customer' && req.user ? req.user : null;
      const customer = authenticatedCustomer
        || (customer_email ? await Customer.findOne({ where: { email: customer_email }, transaction: t }) : null);

      let discount_amount = 0;
      const itemSubtotal = Number(subtotal_amount || items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0));
      const actualShippingCharge = Math.max(0, Number(shipping_charge || 0));
      const actualShippingDiscount = Math.max(0, Math.min(actualShippingCharge, Number(shipping_discount || 0)));
      const actualPaymentFee = Math.max(0, Number(payment_fee || 0));
      const actualPaymentDiscount = Math.max(0, Number(payment_discount || 0));
      let final_total = Number(total_amount || 0);

      if (String(payment_method).toUpperCase() === 'COD' && itemSubtotal > config.codMaxAmount) {
        await t.rollback();
        return res.status(400).json({ message: `COD is available only up to Rs. ${config.codMaxAmount}.` });
      }

      if (coupon_code) {
        const Coupon = require('../models/Coupon');
        const coupon = await Coupon.findOne({ where: { code: coupon_code, is_active: true } });
        if (coupon) {
          // Double check validity (simple check here)
          if (coupon.discount_type === 'percentage') {
            discount_amount = (final_total * coupon.discount_percent) / 100;
            if (coupon.max_discount_amount) {
              discount_amount = Math.min(discount_amount, coupon.max_discount_amount);
            }
          } else {
            discount_amount = coupon.discount_amount;
          }
          final_total = Math.max(0, final_total - discount_amount);
          
          // Increment usage
          await coupon.increment('usage_count', { by: 1, transaction: t });
        }
      }

      let walletDebit = 0;
      if (Number(wallet_amount || 0) > 0) {
        if (!customer) {
          await t.rollback();
          return res.status(400).json({ message: 'Wallet can be used only by logged in customers.' });
        }

        const lockedCustomer = await Customer.findByPk(customer.id, { transaction: t, lock: t.LOCK.UPDATE });
        const walletBalance = Number(lockedCustomer?.wallet_balance || 0);
        walletDebit = Math.min(Number(wallet_amount || 0), walletBalance, final_total);
        if (walletDebit > 0) {
          final_total = Math.max(0, final_total - walletDebit);
        }
      }

      const orderColumns = await ensureOrderAccountingColumns();
      const orderItemColumns = await ensureOrderItemAccountingColumns();
      const itemShippingMetas = allocateItemShipping({
        items,
        productMap,
        shippingCharge: actualShippingCharge,
        shippingDiscount: actualShippingDiscount,
        shippingDiscountReason: shipping_discount_reason,
      });
      const orderPayload = keepExistingColumns({
        customer_id: customer?.id || null,
        customer_name: customer_name || customer?.name,
        customer_email: customer?.email || customer_email,
        address,
        city,
        state: state || 'Uttar Pradesh',
        pincode,
        phone,
        subtotal_amount: itemSubtotal,
        shipping_charge: actualShippingCharge,
        shipping_discount: actualShippingDiscount,
        payment_fee: actualPaymentFee,
        payment_discount: actualPaymentDiscount,
        total_amount: final_total,
        coupon_code,
        discount_amount,
        wallet_amount: walletDebit,
        payable_amount: final_total,
        payment_method,
        payment_status: payment_method === 'COD' ? 'Pending' : payment_status
      }, orderColumns);

      const order = await Order.create(orderPayload, {
        fields: Object.keys(orderPayload),
        transaction: t,
      });

      const orderItems = items.map((item, index) => ({
        order_id: order.id,
        product_id: item.id,
        colorId: item.colorId || item.color_id || null,
        quantity: item.quantity,
        price: item.price,
        product_name: item.name || item.product_name,
        shipping_meta: itemShippingMetas[index] || null,
      })).map((item) => keepExistingColumns(item, orderItemColumns));

      await OrderItem.bulkCreate(orderItems, {
        fields: Object.keys(orderItems[0] || {}),
        transaction: t,
      });

      if (walletDebit > 0 && customer) {
        await WalletTransaction.create({
          customer_id: customer.id,
          amount: -walletDebit,
          type: "ORDER_PAYMENT",
          status: "completed",
          available_at: null,
          dedupe_key: `order_wallet:${order.id}`,
          meta: { order_id: order.id },
        }, { transaction: t });

        await Customer.decrement(
          { wallet_balance: walletDebit },
          { where: { id: customer.id }, transaction: t },
        );
      }

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
          const currentColumns = await ensureOrderAccountingColumns();
          const safeUpdatePayload = keepExistingColumns(updatePayload, currentColumns);
          if (Object.keys(safeUpdatePayload).length > 0) {
            await Order.update(safeUpdatePayload, { where: { id: order.id } });
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
      res.status(error.status || 500).json({ message: error.message });
    }
  }

  async getMyOrders(req, res) {
    try {
      await ensureOrderAccountingColumns();
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
      await ensureOrderAccountingColumns();
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
      const isOwnedByCustomerId = Number(order.customer_id) === Number(req.user?.id);
      const isLegacyOwnedByEmail = !order.customer_id
        && req.user?.email
        && String(order.customer_email || '').toLowerCase() === String(req.user.email).toLowerCase();
      if (req.userRole !== 'admin' && !isOwnedByCustomerId && !isLegacyOwnedByEmail) {
        return res.status(403).json({ message: 'This order does not belong to this customer.' });
      }

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
      return res.status(200).json({
        source: 'unavailable',
        message: 'Tracking service is temporarily unavailable. Please try again shortly.',
        tracking: { tracking_data: { shipment_track_activities: [] } },
      });
    }
  }

  async getCurrentCustomerOrders(req, res) {
    try {
      await ensureOrderAccountingColumns();
      if (!req.user?.id || req.userRole === 'admin') {
        return res.status(401).json({ message: 'Customer authentication required' });
      }

      const orders = await Order.findAll({
        where: {
          [Op.or]: [
            { customer_id: req.user.id },
            { customer_id: null, customer_email: req.user.email },
          ],
        },
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

  async getCustomerOrderById(req, res) {
    try {
      await ensureOrderAccountingColumns();
      if (!req.user?.id || req.userRole === 'admin') {
        return res.status(401).json({ message: 'Customer authentication required' });
      }

      const order = await Order.findOne({
        where: {
          id: req.params.id,
          [Op.or]: [
            { customer_id: req.user.id },
            { customer_id: null, customer_email: req.user.email },
          ],
        },
        include: [{
          model: OrderItem,
          include: [
            { model: Product, attributes: ['id', 'name', 'slug', 'images'] },
            { model: Color, attributes: ['id', 'name', 'hex_code'] },
          ],
        }],
      });

      if (!order) return res.status(404).json({ message: 'Order not found' });
      return res.status(200).json(serializeOrder(order));
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  async cancelOrder(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const order = await Order.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });

      if (!order) {
        await t.rollback();
        return res.status(404).json({ message: 'Order not found' });
      }

      const isOwnedByCustomerId = Number(order.customer_id) === Number(req.user?.id);
      const isLegacyOwnedByEmail = !order.customer_id
        && req.user?.email
        && String(order.customer_email || '').toLowerCase() === String(req.user.email).toLowerCase();
      if (req.userRole !== 'admin' && !isOwnedByCustomerId && !isLegacyOwnedByEmail) {
        await t.rollback();
        return res.status(403).json({ message: 'This order does not belong to this customer.' });
      }

      const currentStatus = String(order.status || '').toLowerCase();
      if (['cancelled', 'delivered'].includes(currentStatus)) {
        await t.rollback();
        return res.status(400).json({ message: `Order is already ${order.status}.` });
      }

      const createdAt = new Date(order.createdAt);
      const hoursSinceOrder = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceOrder > 24) {
        await t.rollback();
        return res.status(400).json({ message: 'Cancellation is available only within 24 hours of placing the order.' });
      }

      let shiprocketCancel = null;
      if (order.shiprocket_order_id) {
        try {
          shiprocketCancel = await ShipRocketService.cancelOrders([order.shiprocket_order_id]);
        } catch (error) {
          console.error(`[ShipRocket] Cancel failed for order #${order.id}:`, error?.response?.data || error.message);
          shiprocketCancel = { warning: 'ShipRocket cancellation could not be confirmed automatically.' };
        }
      }

      const paymentMethod = String(order.payment_method || 'Prepaid');
      const paidAmount = Number(order.payable_amount ?? order.total_amount ?? 0);
      const refundNote = paymentMethod.toUpperCase() === 'COD'
        ? 'COD order cancelled. No prepaid refund is needed.'
        : `Refund of Rs. ${paidAmount.toLocaleString('en-IN')} will be processed in 1-2 days.`;

      const columns = await ensureOrderAccountingColumns();
      const updatePayload = keepExistingColumns({
        status: 'Cancelled',
        cancelled_at: new Date(),
        refund_status: paymentMethod.toUpperCase() === 'COD' ? 'Not Required' : 'Refund Pending',
        refund_note: refundNote,
        payment_status: paymentMethod.toUpperCase() === 'COD' ? 'Cancelled' : 'Refund Pending',
      }, columns);

      await order.update(updatePayload, { transaction: t });
      await t.commit();

      const updatedOrder = await Order.findByPk(id, {
        include: [{
          model: OrderItem,
          include: [
            { model: Product, attributes: ['id', 'name', 'slug', 'images'] },
            { model: Color, attributes: ['id', 'name', 'hex_code'] },
          ],
        }],
      });

      return res.status(200).json({
        message: 'Order cancelled successfully.',
        refund_message: refundNote,
        shiprocket: shiprocketCancel,
        order: serializeOrder(updatedOrder),
      });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ message: error.message });
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
