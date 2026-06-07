const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const Color = require('../models/Color');
const Customer = require('../models/Customer');
const WalletTransaction = require('../models/WalletTransaction');
const Feedback = require('../models/Feedback');
const OrderItemAction = require('../models/OrderItemAction');
const { sequelize } = require('../config/db');
const { DataTypes } = require('sequelize');
const crypto = require('crypto');
const EmailService = require('../services/EmailService');
const ShipRocketService = require('../services/ShipRocketService');
const WalletService = require('../services/WalletService');
const { refundPayment: razorpayRefund } = require('../services/RazorpayService');
const { config } = require('../config/env');
const { Op } = require("sequelize");
const { AppError } = require('../utils/http');
const { formatOrderNumber, formatProductCode, formatVariantItemCode } = require('../utils/codes');
const {
  ORDER_LIFECYCLE_COLUMNS,
  COD_BLOCK_MESSAGE,
  ensureOrderLifecycleColumns,
  isCodBlockedForContact,
} = require('../utils/orderLifecycle');
const { ensureFeedbackColumns } = require('../utils/feedbackSchema');
const { ensureOrderItemActionSchema, getActionableQuantity } = require('../utils/orderItemActions');

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

const serializeOrder = (order, feedbackRows = [], actionRows = []) => {
  const json = order.toJSON();
  const rows = Array.isArray(feedbackRows)
    ? feedbackRows.map((item) => (typeof item?.toJSON === 'function' ? item.toJSON() : item))
    : [];
  const feedbackByItem = new Map(
    rows.map((item) => [`${item.order_id}:${item.order_item_id}:${item.product_id}`, item]),
  );
  const nestedActions = (json.OrderItems || []).flatMap((item) => item.OrderItemActions || []);
  const actions = Array.isArray(actionRows)
    ? actionRows.map((item) => (typeof item?.toJSON === 'function' ? item.toJSON() : item))
    : [];
  actions.push(...nestedActions);
  const actionsByItem = actions.reduce((map, action) => {
    const key = String(action.order_item_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(action);
    return map;
  }, new Map());
  json.OrderItems = (json.OrderItems || []).map((item) => ({
    id: item.id,
    product_id: item.product_id,
    sku: item.sku || null,
    product_name: item.product_name || item.Product?.name || `Product #${item.product_id}`,
    quantity: item.quantity,
    price: item.price,
    colorId: item.colorId || item.color_id || null,
    color_name: item.Color?.name || null,
    color_hex: item.Color?.hex_code || null,
    image_url: pickOrderItemImage(item.Product, item.colorId || item.color_id),
    product_slug: item.Product?.slug || null,
    shipping_meta: item.shipping_meta || null,
    status: item.status || 'Active',
    cancelled_quantity: Number(item.cancelled_quantity || 0),
    returned_quantity: Number(item.returned_quantity || 0),
    exchanged_quantity: Number(item.exchanged_quantity || 0),
    pending_action_quantity: Number(item.pending_action_quantity || 0),
    actionable_quantity: getActionableQuantity(item),
    actions: actionsByItem.get(String(item.id)) || [],
    feedback: feedbackByItem.get(`${json.id}:${item.id}:${item.product_id}`) || null,
  }));
  return json;
};

let orderAccountingColumnsReady = false;
let orderColumnCache = null;

const REQUIRED_ORDER_COLUMNS = {
  platform_fee: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
  cod_fee: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
  payment_gateway: { type: DataTypes.STRING, allowNull: true },
  gateway_order_id: { type: DataTypes.STRING, allowNull: true },
  gateway_payment_id: { type: DataTypes.STRING, allowNull: true },
  gateway_signature: { type: DataTypes.TEXT, allowNull: true },
  gateway_amount_paise: { type: DataTypes.INTEGER, allowNull: true },
  gateway_currency: { type: DataTypes.STRING, allowNull: true },
  payment_verified_at: { type: DataTypes.DATE, allowNull: true },
  payment_gateway_response: { type: DataTypes.JSONB, allowNull: true },
  payment_failure_reason: { type: DataTypes.TEXT, allowNull: true },
  refund_bank_details: { type: DataTypes.JSONB, allowNull: true },
  refund_payment_reference: { type: DataTypes.STRING, allowNull: true },
  refund_processed_at: { type: DataTypes.DATE, allowNull: true },
  refund_processed_by: { type: DataTypes.INTEGER, allowNull: true },
  ...ORDER_LIFECYCLE_COLUMNS,
};

const ensureOrderAccountingColumns = async () => {
  await ensureOrderLifecycleColumns();
  const queryInterface = sequelize.getQueryInterface();
  const table = { tableName: 'orders', schema: config.dbSchema };
  if (orderAccountingColumnsReady && orderColumnCache) return orderColumnCache;
  let columns = await queryInterface.describeTable(table);
  for (const [column, definition] of Object.entries(REQUIRED_ORDER_COLUMNS)) {
    if (!columns[column]) {
      await queryInterface.addColumn(table, column, definition);
    }
  }
  columns = await queryInterface.describeTable(table);
  orderColumnCache = columns;
  orderAccountingColumnsReady = true;
  return columns;
};

const keepExistingColumns = (payload, columns) =>
  Object.fromEntries(Object.entries(payload).filter(([key]) => columns[key]));


let orderItemColumnsReady = false;
let orderItemColumnCache = null;

const ensureOrderItemAccountingColumns = async () => {
  await ensureOrderItemActionSchema();
  const queryInterface = sequelize.getQueryInterface();
  const table = { tableName: 'order_items', schema: config.dbSchema };
  if (orderItemColumnsReady && orderItemColumnCache) return orderItemColumnCache;
  const columns = await queryInterface.describeTable(table);
  orderItemColumnCache = columns;
  orderItemColumnsReady = true;
  return columns;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const toPaise = (value) => Math.round(roundMoney(value) * 100);

const verifyRazorpayPayment = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return false;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expectedSignature === signature;
};

const getProductWeightKg = (product) => {
  const rawWeight = Number(product?.weight);
  if (!Number.isFinite(rawWeight) || rawWeight <= 0) return 0.5;
  return rawWeight;
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
  const boxWeightKg = Math.max(0, Number(config.packageWeightKg));
  const effectiveShippingPaid = Math.max(0, allocatedShipping - allocatedShippingDiscount);
  const isFirstOrderFreeShipping = shippingDiscountReason === 'first_order';
  const returnDeliveryDeduction = isFirstOrderFreeShipping ? 0 : allocatedShipping;

  return {
    product_weight_kg: roundMoney(productWeightKg),
    box_weight_kg: roundMoney(boxWeightKg),
    quantity,
    allocation_weight_kg: roundMoney(allocationWeight),
    delivery_charge: roundMoney(allocatedShipping),
    delivery_discount: roundMoney(allocatedShippingDiscount),
    delivery_paid: roundMoney(effectiveShippingPaid),
    refund_rules: {
      free_shipping_reason: shippingDiscountReason || null,
      exchange_delivery_deduction: 0,
      return_delivery_deduction: roundMoney(returnDeliveryDeduction),
      return_total_logistics_deduction: roundMoney(returnDeliveryDeduction),
      note: isFirstOrderFreeShipping
        ? 'First-order free shipping: delivery is not deducted on return.'
        : 'Return refund deducts the forward delivery charge. Exchange has no logistics deduction.',
    },
  };
};

const allocateItemShipping = ({ items, productMap, shippingCharge, shippingDiscount, shippingDiscountReason }) => {
  const lines = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const product = productMap[item.id];
    const productWeightKg = getProductWeightKg(product);
    const allocationWeight = (productWeightKg + Math.max(0, Number(config.packageWeightKg))) * quantity;
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
      await ensureOrderLifecycleColumns();
      const { 
        customer_name, customer_email, address, city, state, pincode, phone, 
        subtotal_amount, shipping_charge = 0, shipping_discount_reason = null,
        selected_courier_data = null, items, coupon_code, wallet_amount = 0,
        payment_method = 'Prepaid', payment_status = 'Paid',
        payment_gateway = null, gateway_order_id = null, gateway_payment_id = null,
        gateway_signature = null, gateway_amount_paise = null, gateway_currency = 'INR',
        payment_gateway_response = null
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        await t.rollback();
        return res.status(400).json({ message: 'Order items are required' });
      }

      // Idempotency: prevent duplicate orders from network retries
      if (gateway_payment_id) {
        const existing = await Order.findOne({ where: { gateway_payment_id }, transaction: t });
        if (existing) {
          await t.rollback();
          return res.status(200).json({ orderId: existing.id, order_number: existing.order_number, duplicate: true });
        }
      }

      const productIds = [...new Set(items.map((item) => item.id).filter(Boolean))];
      const products = await Product.findAll({
        where: { id: productIds },
        attributes: ['id', 'name', 'sku', 'variant_skus', 'weight', 'stock_quantity', 'color_stocks', 'status'],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
      const missingProductId = productIds.find((id) => !productMap[id]);
      if (missingProductId) {
        await t.rollback();
        return res.status(400).json({ message: `Invalid product in cart: ${missingProductId}` });
      }
      // Pre-validate all items before any stock decrement
      const stockErrors = [];
      for (const item of items) {
        const productForStock = productMap[item.id];
        if (productForStock.status !== 'active') {
          stockErrors.push(`${productForStock.name} is currently unavailable.`);
          continue;
        }
        const colorId = item.colorId || item.color_id || null;
        const available = Math.min(
          getColorStockValue(productForStock, colorId),
          Number(productForStock.stock_quantity || 0)
        );
        const qty = Math.max(1, Number(item.quantity || 1));
        if (available < qty) {
          stockErrors.push(`Only ${Math.max(0, available)} item(s) available for ${productForStock.name}.`);
        }
      }
      if (stockErrors.length > 0) {
        await t.rollback();
        return res.status(400).json({ message: stockErrors[0], errors: stockErrors });
      }

      for (const item of items) {
        await decrementProductInventory({
          product: productMap[item.id],
          colorId: item.colorId || item.color_id || null,
          quantity: item.quantity,
          transaction: t,
        });
      }

      const colorIds = [...new Set(items.map((item) => item.colorId || item.color_id).filter(Boolean))];
      const colors = colorIds.length
        ? await Color.findAll({
          where: { id: colorIds },
          attributes: ['id', 'name', 'slug'],
          transaction: t,
        })
        : [];
      const colorMap = Object.fromEntries(colors.map((color) => [String(color.id), color]));
      const enrichedItems = items.map((item) => {
        const productForItem = productMap[item.id];
        const colorId = item.colorId || item.color_id || null;
        const variantSku = productForItem?.variant_skus?.[String(colorId)] || productForItem?.sku || formatProductCode(productForItem?.id || item.id);
        return {
          ...item,
          sku: variantSku,
        };
      });

      const authenticatedCustomer = req.userRole === 'customer' && req.user ? req.user : null;
      const customer = authenticatedCustomer
        || (customer_email ? await Customer.findOne({ where: { email: customer_email }, transaction: t }) : null);

      let discount_amount = 0;
      const itemSubtotal = Number(subtotal_amount || items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0));
      const actualShippingCharge = Math.max(0, Number(shipping_charge || 0));
      const actualShippingDiscount = actualShippingCharge;
      const effectiveShippingDiscountReason = actualShippingCharge > 0 ? (shipping_discount_reason || 'free_delivery') : null;
      const normalizedPaymentMethod = String(payment_method || 'Prepaid').toUpperCase() === 'COD' ? 'COD' : 'Prepaid';
      const normalizedPaymentStatus = normalizedPaymentMethod === 'COD' ? 'Pending' : (payment_status || 'Paid');
      const actualPlatformFee = Math.max(0, Number(config.platformFeeAmount || 0));
      const actualCodFee = normalizedPaymentMethod === 'COD' ? Math.max(0, Number(config.codFeeAmount || 0)) : 0;
      const actualPaymentFee = actualPlatformFee + actualCodFee;
      const actualPaymentDiscount = normalizedPaymentMethod === 'Prepaid'
        ? Math.min(Number(config.prepaidDiscountAmount || 0), itemSubtotal)
        : 0;
      let final_total = Math.max(0, itemSubtotal + actualShippingCharge - actualShippingDiscount + actualPaymentFee - actualPaymentDiscount);
      const normalizedGateway = normalizedPaymentMethod === 'Prepaid'
        ? String(payment_gateway || 'razorpay').trim().toLowerCase()
        : null;
      let paymentVerifiedAt = null;
      let paymentFailureReason = null;

      if (normalizedPaymentMethod === 'COD' && itemSubtotal > config.codMaxAmount) {
        await t.rollback();
        return res.status(400).json({ message: `COD is available only up to Rs. ${config.codMaxAmount}.` });
      }

      if (normalizedPaymentMethod === 'COD') {
        const codBlocked = await isCodBlockedForContact({
          customerId: customer?.id,
          email: customer?.email || customer_email,
          phone,
          transaction: t,
        });

        if (codBlocked) {
          await t.rollback();
          return res.status(403).json({ message: COD_BLOCK_MESSAGE });
        }
      }

      if (coupon_code) {
        const Coupon = require('../models/Coupon');
        const coupon = await Coupon.findOne({
          where: { code: coupon_code, is_active: true },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (coupon) {
          if (coupon.max_usage && Number(coupon.usage_count || 0) >= Number(coupon.max_usage)) {
            await t.rollback();
            return res.status(400).json({ message: 'This coupon has reached its usage limit.' });
          }
          if (coupon.discount_type === 'percentage') {
            discount_amount = (final_total * coupon.discount_percent) / 100;
            if (coupon.max_discount_amount) {
              discount_amount = Math.min(discount_amount, coupon.max_discount_amount);
            }
          } else {
            discount_amount = coupon.discount_amount;
          }
          final_total = Math.max(0, final_total - discount_amount);
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

      const expectedGatewayAmountPaise = toPaise(final_total);

      if (normalizedPaymentMethod === 'Prepaid') {
        if (normalizedGateway !== 'razorpay') {
          await t.rollback();
          return res.status(400).json({ message: 'Online payment provider is not supported.' });
        }

        const signatureValid = verifyRazorpayPayment({
          orderId: gateway_order_id,
          paymentId: gateway_payment_id,
          signature: gateway_signature,
        });

        if (!signatureValid) {
          await t.rollback();
          return res.status(400).json({ message: 'Payment could not be verified. Please try again.' });
        }

        if (gateway_amount_paise !== null && gateway_amount_paise !== undefined) {
          const paidAmountPaise = Number(gateway_amount_paise);
          if (!Number.isFinite(paidAmountPaise) || paidAmountPaise !== expectedGatewayAmountPaise) {
            await t.rollback();
            return res.status(400).json({ message: 'Payment amount does not match this order.' });
          }
        }

        paymentVerifiedAt = new Date();
      }

      const orderColumns = await ensureOrderAccountingColumns();
      const orderItemColumns = await ensureOrderItemAccountingColumns();
      const itemShippingMetas = allocateItemShipping({
        items,
        productMap,
        shippingCharge: actualShippingCharge,
        shippingDiscount: actualShippingDiscount,
        shippingDiscountReason: effectiveShippingDiscountReason,
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
        platform_fee: actualPlatformFee,
        cod_fee: actualCodFee,
        payment_discount: actualPaymentDiscount,
        total_amount: final_total,
        coupon_code,
        discount_amount,
        wallet_amount: walletDebit,
        payable_amount: final_total,
        selected_courier_data,
        payment_method: normalizedPaymentMethod,
        payment_status: normalizedPaymentStatus,
        payment_gateway: normalizedGateway,
        gateway_order_id: normalizedPaymentMethod === 'Prepaid' ? gateway_order_id : null,
        gateway_payment_id: normalizedPaymentMethod === 'Prepaid' ? gateway_payment_id : null,
        gateway_signature: normalizedPaymentMethod === 'Prepaid' ? gateway_signature : null,
        gateway_amount_paise: normalizedPaymentMethod === 'Prepaid' ? expectedGatewayAmountPaise : null,
        gateway_currency: normalizedPaymentMethod === 'Prepaid' ? String(gateway_currency || 'INR').toUpperCase() : null,
        payment_verified_at: paymentVerifiedAt,
        payment_gateway_response: normalizedPaymentMethod === 'Prepaid' ? payment_gateway_response : null,
        payment_failure_reason: paymentFailureReason,
        is_rto: false,
        rto_count: 0,
        is_redispatched: false,
        redispatch_count: 0,
        original_order_id: null,
        redispatch_payment_amount: 0,
        customer_cod_blocked: false,
        cod_blocked_at: null,
        cod_block_reason: null,
        refund_amount: 0,
      }, orderColumns);

      const order = await Order.create(orderPayload, {
        fields: Object.keys(orderPayload),
        transaction: t,
      });

      // Generate order_number after insert — uses the DB-assigned id
      const orderNumber = formatOrderNumber(new Date(), order.id);
      await order.update({ order_number: orderNumber }, { transaction: t });
      order.order_number = orderNumber;

      const orderItems = enrichedItems.map((item, index) => ({
        order_id: order.id,
        product_id: item.id,
        colorId: item.colorId || item.color_id || null,
        quantity: item.quantity,
        price: item.price,
        product_name: item.name || item.product_name,
        sku: item.sku,
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
      EmailService.sendOrderConfirmation(order, enrichedItems);

      // ── Fire & forget: push to ShipRocket (never blocks customer response) ──
      (async () => {
        try {
          const srItems = enrichedItems.map((item, idx) => ({
            product_id: item.id,
            quantity: item.quantity,
            price: item.price,
            name: item.name || item.product_name || `Product ${idx + 1}`,
            sku: item.sku,
          }));

          const srResult = await ShipRocketService.createOrder({
            order: { ...order.toJSON(), state: state || 'Uttar Pradesh' },
            items: srItems,
          });

          const updatePayload = {};
          if (srResult?.order_id) updatePayload.shiprocket_order_id = String(srResult.order_id);
          if (srResult?.awb_code) {
            updatePayload.shiprocket_awb = String(srResult.awb_code);
            updatePayload.status = 'AWB Assigned';
          } else {
            updatePayload.status = 'Processing';
          }
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

      res.status(201).json({ message: 'Order placed successfully', orderId: order.id, orderNumber: order.order_number });
    } catch (error) {
      await t.rollback();
      res.status(error.status || 500).json({ message: error.message });
    }
  }

   async getMyOrders(req, res) {
    try {
      await ensureOrderAccountingColumns();
      await ensureOrderItemActionSchema();
      const { status, paymentMethod, customer, q } = req.query;
      const where = {};
      if (status && status !== 'all') where.status = status;
      if (paymentMethod && paymentMethod !== 'all') where.payment_method = paymentMethod;
      const customerSearch = String(customer || q || '').trim();
      if (customerSearch) {
        where[Op.or] = [
          { customer_name: { [Op.iLike]: `%${customerSearch}%` } },
          { customer_email: { [Op.iLike]: `%${customerSearch}%` } },
          { phone: { [Op.iLike]: `%${customerSearch}%` } },
          { order_number: { [Op.iLike]: `%${customerSearch}%` } },
        ];
      }
      const orders = await Order.findAll({
        where,
        include: [{
          model: OrderItem,
          include: [
            { model: Product, attributes: ['id', 'name', 'slug', 'images'] },
            { model: Color, attributes: ['id', 'name', 'slug', 'hex_code'] },
            { model: OrderItemAction },
          ],
        }],
        order: [['createdAt', 'DESC']],
      });
      res.status(200).json(orders.map((order) => serializeOrder(order)));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
  async saveRefundBankDetails(req, res) {
    try {
      await ensureOrderAccountingColumns();
      if (!req.user?.id || req.userRole === 'admin') {
        return res.status(401).json({ message: 'Customer authentication required' });
      }

      const order = await Order.findByPk(req.params.id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      const isOwnedByCustomerId = Number(order.customer_id) === Number(req.user.id);
      const isLegacyOwnedByEmail = !order.customer_id
        && req.user?.email
        && String(order.customer_email || '').toLowerCase() === String(req.user.email).toLowerCase();
      if (!isOwnedByCustomerId && !isLegacyOwnedByEmail) {
        return res.status(403).json({ message: 'This order does not belong to this customer.' });
      }

      const accountHolderName = String(req.body.account_holder_name || '').trim();
      const accountNumber = String(req.body.account_number || '').replace(/\s+/g, '');
      const ifscCode = String(req.body.ifsc_code || '').trim().toUpperCase();
      const bankName = String(req.body.bank_name || '').trim();
      const branchName = String(req.body.branch_name || '').trim();

      if (accountHolderName.length < 3) {
        return res.status(400).json({ message: 'Please enter the bank account holder name.' });
      }
      if (!/^\d{6,18}$/.test(accountNumber)) {
        return res.status(400).json({ message: 'Please enter a valid bank account number.' });
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
        return res.status(400).json({ message: 'Please enter a valid IFSC code.' });
      }
      if (bankName.length < 2) {
        return res.status(400).json({ message: 'Please enter the bank name.' });
      }

      await order.update({
        refund_bank_details: {
          account_holder_name: accountHolderName,
          account_number_last4: accountNumber.slice(-4),
          account_number: accountNumber,
          ifsc_code: ifscCode,
          bank_name: bankName,
          branch_name: branchName || null,
          updated_at: new Date().toISOString(),
        },
        refund_status: order.refund_status || 'Bank Details Submitted',
      });

      return res.status(200).json({ message: 'Bank details saved for refund.' });
    } catch (error) {
      console.error('[Order] saveRefundBankDetails error:', error.message);
      return res.status(500).json({ message: 'Unable to save bank details right now.' });
    }
  }

  async updateRefundStatus(req, res) {
    try {
      await ensureOrderAccountingColumns();
      const order = await Order.findByPk(req.params.id);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      const refundStatus = String(req.body.refund_status || '').trim();
      if (!refundStatus) return res.status(400).json({ message: 'refund_status is required' });

      const updatePayload = {
        refund_status: refundStatus,
        refund_note: req.body.refund_note || order.refund_note,
        refund_payment_reference: req.body.refund_payment_reference || order.refund_payment_reference,
      };

      if (String(refundStatus).toLowerCase().includes('paid') || String(refundStatus).toLowerCase().includes('processed')) {
        updatePayload.refund_processed_at = new Date();
        updatePayload.refund_processed_by = req.user?.id || null;
      }

      await order.update(updatePayload);
      return res.status(200).json({ message: 'Refund status updated.', order: serializeOrder(order) });
    } catch (error) {
      console.error('[Order] updateRefundStatus error:', error.message);
      return res.status(500).json({ message: 'Unable to update refund status right now.' });
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
            { model: Color, attributes: ['id', 'name', 'slug', 'hex_code'] },
            { model: OrderItemAction },
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
      await ensureFeedbackColumns();
      await ensureOrderItemActionSchema();
      if (!req.user?.id || req.userRole === 'admin') {
        return res.status(401).json({ message: 'Customer authentication required' });
      }

      const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (pageNum - 1) * pageSize;

      const { count, rows: orders } = await Order.findAndCountAll({
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
            { model: Color, attributes: ['id', 'name', 'slug', 'hex_code'] },
            { model: OrderItemAction },
          ],
        }],
        order: [['createdAt', 'DESC']],
        limit: pageSize,
        offset,
        distinct: true,
      });
      const orderIds = orders.map((order) => order.id);
      const feedbacks = orderIds.length
        ? await Feedback.findAll({
          where: { customer_id: req.user.id, order_id: orderIds },
          attributes: ['id', 'order_id', 'order_item_id', 'product_id', 'rating', 'comment', 'title', 'images', 'is_approved'],
        })
        : [];
      const serialized = orders.map((order) => serializeOrder(order, feedbacks.map((item) => item.toJSON())));
      res.status(200).json(serialized);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  async getCustomerOrderById(req, res) {
    try {
      await ensureOrderAccountingColumns();
      await ensureFeedbackColumns();
      await ensureOrderItemActionSchema();
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
            { model: Color, attributes: ['id', 'name', 'slug', 'hex_code'] },
            { model: OrderItemAction },
          ],
        }],
      });

      if (!order) return res.status(404).json({ message: 'Order not found' });
      const feedbacks = await Feedback.findAll({
        where: { customer_id: req.user.id, order_id: order.id },
        attributes: ['id', 'order_id', 'order_item_id', 'product_id', 'rating', 'comment', 'title', 'images', 'is_approved'],
      });
      return res.status(200).json(serializeOrder(order, feedbacks.map((item) => item.toJSON())));
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

      // Restock all non-cancelled items
      const activeOrderItems = await OrderItem.findAll({
        where: { order_id: id, status: { [Op.ne]: 'Cancelled' } },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      for (const oi of activeOrderItems) {
        const prod = await Product.findByPk(oi.product_id, {
          attributes: ['id', 'stock_quantity', 'color_stocks'],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (prod) {
          const qty = Number(oi.quantity || 1);
          const colorId = oi.colorId || oi.color_id;
          const stocks = { ...(prod.color_stocks || {}) };
          const hasColor = colorId !== null && colorId !== undefined && colorId !== '';
          const restockPayload = { stock_quantity: Number(prod.stock_quantity || 0) + qty };
          if (hasColor) {
            stocks[String(colorId)] = Number(stocks[String(colorId)] ?? prod.stock_quantity ?? 0) + qty;
            restockPayload.color_stocks = stocks;
          }
          await prod.update(restockPayload, { transaction: t });
        }
      }
      await OrderItem.update(
        { status: 'Cancelled' },
        { where: { order_id: id, status: { [Op.ne]: 'Cancelled' } }, transaction: t },
      );

      // Decrement coupon usage count
      if (order.coupon_code) {
        const Coupon = require('../models/Coupon');
        await Coupon.decrement('usage_count', {
          by: 1,
          where: { code: order.coupon_code, usage_count: { [Op.gt]: 0 } },
          transaction: t,
        });
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

      const { reason } = req.body;
      const paymentMethod = String(order.payment_method || 'COD');
      const paidAmount = Number(order.payable_amount ?? order.total_amount ?? 0);
      let refundNote = paymentMethod.toUpperCase() === 'COD'
        ? 'COD order cancelled. No online payment refund is needed.'
        : `Refund of Rs. ${paidAmount.toLocaleString('en-IN')} will be processed in 1-2 days.`;
      if (reason && reason.trim()) {
        refundNote += ` | Reason: ${reason.trim()}`;
      }

      const columns = await ensureOrderAccountingColumns();
      const updatePayload = keepExistingColumns({
        status: 'Cancelled',
        cancelled_at: new Date(),
        refund_status: paymentMethod.toUpperCase() === 'COD' ? 'Not Required' : 'Refund Pending',
        refund_note: refundNote,
        refund_amount: paymentMethod.toUpperCase() === 'COD' ? 0 : paidAmount,
        payment_status: paymentMethod.toUpperCase() === 'COD' ? 'Cancelled' : 'Refund Pending',
      }, columns);

      await order.update(updatePayload, { transaction: t });

      // Refund wallet amount if customer paid with wallet
      const walletRefund = Number(order.wallet_amount || 0);
      if (walletRefund > 0 && order.customer_id) {
        await WalletTransaction.create({
          customer_id: order.customer_id,
          amount: walletRefund,
          type: 'ORDER_CANCELLATION_REFUND',
          status: 'completed',
          available_at: null,
          dedupe_key: `order_cancel_wallet:${order.id}`,
          meta: { order_id: order.id },
        }, { transaction: t });
        await Customer.increment(
          { wallet_balance: walletRefund },
          { where: { id: order.customer_id }, transaction: t },
        );
      }

      await t.commit();

      // Initiate Razorpay refund for prepaid orders (fire & forget — wallet credit already given)
      if (paymentMethod.toUpperCase() !== 'COD' && order.gateway_payment_id) {
        razorpayRefund(order.gateway_payment_id, paidAmount, {
          reason: 'Customer cancellation',
          orderId: String(order.id),
        }).catch((err) => {
          console.error(`[Razorpay] Refund failed for order #${order.id}:`, err?.message || err);
        });
      }

      EmailService.sendOrderStatusUpdate(order, 'Cancelled').catch((error) => {
        console.error('[Email] Order cancellation email failed:', error.message);
      });

      const updatedOrder = await Order.findByPk(id, {
        include: [{
          model: OrderItem,
          include: [
            { model: Product, attributes: ['id', 'name', 'slug', 'images'] },
            { model: Color, attributes: ['id', 'name', 'slug', 'hex_code'] },
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

  async cancelOrderItem(req, res) {
    const t = await sequelize.transaction();
    try {
      const { orderId, itemId } = req.params;
      const { reason } = req.body;
      const order = await Order.findByPk(orderId, { transaction: t, lock: t.LOCK.UPDATE });

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

      const item = await OrderItem.findOne({
        where: { id: itemId, order_id: orderId },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!item) {
        await t.rollback();
        return res.status(404).json({ message: 'Order item not found' });
      }

      // Restock inventory
      const product = await Product.findByPk(item.product_id, {
        attributes: ['id', 'name', 'stock_quantity', 'color_stocks', 'status'],
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (product) {
        const qty = Number(item.quantity || 1);
        const colorId = item.colorId || item.color_id;
        const stocks = { ...(product.color_stocks || {}) };
        const hasColor = colorId !== null && colorId !== undefined && colorId !== "";
        
        const updatePayload = { stock_quantity: Number(product.stock_quantity || 0) + qty };
        if (hasColor) {
          const currentColorStock = Number(stocks[String(colorId)] ?? product.stock_quantity ?? 0);
          stocks[String(colorId)] = currentColorStock + qty;
          updatePayload.color_stocks = stocks;
        }
        await product.update(updatePayload, { transaction: t });
      }

      // Calculate cancellation values
      const itemPrice = Number(item.price) * Number(item.quantity);
      
      // Check active (not cancelled) items in this order
      const activeItems = await OrderItem.findAll({
        where: {
          order_id: orderId,
          status: { [Op.ne]: 'Cancelled' }
        },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      let shiprocketCancel = null;

      // If it was the only active item in the order, cancel the whole order
      if (activeItems.length <= 1) {
        if (order.shiprocket_order_id) {
          try {
            shiprocketCancel = await ShipRocketService.cancelOrders([order.shiprocket_order_id]);
          } catch (error) {
            console.error(`[ShipRocket] Cancel failed for order #${order.id}:`, error?.response?.data || error.message);
          }
        }

        const paymentMethod = String(order.payment_method || 'COD');
        const paidAmount = Number(order.payable_amount ?? order.total_amount ?? 0);
        let refundNote = paymentMethod.toUpperCase() === 'COD'
          ? 'COD order cancelled. No online payment refund is needed.'
          : `Refund of Rs. ${paidAmount.toLocaleString('en-IN')} will be processed in 1-2 days.`;
        if (reason && reason.trim()) {
          refundNote += ` | Reason: ${reason.trim()}`;
        }

        const columns = await ensureOrderAccountingColumns();
        const updatePayload = keepExistingColumns({
          status: 'Cancelled',
          cancelled_at: new Date(),
          refund_status: paymentMethod.toUpperCase() === 'COD' ? 'Not Required' : 'Refund Pending',
          refund_note: refundNote,
          refund_amount: paymentMethod.toUpperCase() === 'COD' ? 0 : paidAmount,
          payment_status: paymentMethod.toUpperCase() === 'COD' ? 'Cancelled' : 'Refund Pending',
        }, columns);

        await order.update(updatePayload, { transaction: t });
        await item.update({ status: 'Cancelled' }, { transaction: t });

        // Decrement coupon usage count on full cancellation
        if (order.coupon_code) {
          const Coupon = require('../models/Coupon');
          await Coupon.decrement('usage_count', {
            by: 1,
            where: { code: order.coupon_code, usage_count: { [Op.gt]: 0 } },
            transaction: t,
          });
        }

        // Refund wallet amount if customer paid with wallet
        const walletRefund = Number(order.wallet_amount || 0);
        if (walletRefund > 0 && order.customer_id) {
          await WalletTransaction.create({
            customer_id: order.customer_id,
            amount: walletRefund,
            type: 'ORDER_CANCELLATION_REFUND',
            status: 'completed',
            available_at: null,
            dedupe_key: `order_cancel_wallet:${order.id}`,
            meta: { order_id: order.id },
          }, { transaction: t });
          await Customer.increment(
            { wallet_balance: walletRefund },
            { where: { id: order.customer_id }, transaction: t },
          );
        }
      } else {
        // Recalculate and update order totals
        const newSubtotal = Math.max(0, Number(order.subtotal_amount || 0) - itemPrice);
        const newTotal = Math.max(0, Number(order.total_amount || 0) - itemPrice);
        const newPayable = Math.max(0, Number(order.payable_amount || 0) - itemPrice);

        const paymentMethod = String(order.payment_method || 'COD');
        let refundNote = paymentMethod.toUpperCase() === 'COD'
          ? `Item '${item.product_name}' cancelled. Remaining COD collection adjusted to Rs. ${newPayable.toLocaleString('en-IN')}.`
          : `Refund of Rs. ${itemPrice.toLocaleString('en-IN')} for cancelled item '${item.product_name}' will be processed in 1-2 days.`;
        if (reason && reason.trim()) {
          refundNote += ` | Item Reason: ${reason.trim()}`;
        }

        // Cancel the old Shiprocket order so merchant can re-push with updated items.
        // Clear the stored IDs so the order is not confused with a cancelled SR shipment.
        if (order.shiprocket_order_id) {
          try {
            shiprocketCancel = await ShipRocketService.cancelOrders([order.shiprocket_order_id]);
          } catch (error) {
            console.error(`[ShipRocket] Cancel failed for order #${order.id} on item cancellation:`, error?.response?.data || error.message);
          }
        }

        const columns = await ensureOrderAccountingColumns();
        const updatePayload = keepExistingColumns({
          subtotal_amount: newSubtotal,
          total_amount: newTotal,
          payable_amount: newPayable,
          refund_note: order.refund_note ? `${order.refund_note} | ${refundNote}` : refundNote,
          refund_status: paymentMethod.toUpperCase() === 'COD' ? 'Not Required' : 'Refund Pending',
          shiprocket_order_id: null,
          shiprocket_awb: null,
        }, columns);

        await order.update(updatePayload, { transaction: t });
        await item.update({ status: 'Cancelled' }, { transaction: t });
      }

      await t.commit();

      const EmailService = require('../services/EmailService');
      const emailStatus = activeItems.length <= 1 ? 'Cancelled' : 'Partially Cancelled';
      EmailService.sendOrderStatusUpdate(order, emailStatus).catch((error) => {
        console.error(`[Email] Item cancellation email failed for status ${emailStatus}:`, error.message);
      });

      const updatedOrder = await Order.findByPk(orderId, {
        include: [{
          model: OrderItem,
          include: [
            { model: Product, attributes: ['id', 'name', 'slug', 'images'] },
            { model: Color, attributes: ['id', 'name', 'slug', 'hex_code'] },
          ],
        }],
      });

      return res.status(200).json({
        message: 'Item cancelled successfully.',
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

      const itemShipmentStatuses = new Set([
        'order placed',
        'pending',
        'processing',
        'picked up',
        'awb assigned',
        'shipped',
        'out for delivery',
        'delivered',
        'undelivered',
        'rto initiated',
        'rto in transit',
        'rto delivered',
        'seller cancelled',
        'cancelled',
      ]);
      if (itemShipmentStatuses.has(normalized.toLowerCase())) {
        const orderItems = await OrderItem.findAll({
          where: { order_id: order.id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        for (const item of orderItems) {
          const itemStatus = String(item.status || '').toLowerCase();
          const hasItemSpecificAction = ['cancel', 'return', 'exchange'].some((word) => itemStatus.includes(word));
          if (!hasItemSpecificAction) {
            await item.update({ status: normalized }, { transaction: t });
          }
        }
      }

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
