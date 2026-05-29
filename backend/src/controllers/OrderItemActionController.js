const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const OrderItemAction = require('../models/OrderItemAction');
const Product = require('../models/Product');
const Color = require('../models/Color');
const { sequelize } = require('../config/db');
const {
  ACTION_TYPES,
  ACTION_STATUS,
  ensureOrderItemActionSchema,
  normalizeActionType,
  getActionableQuantity,
  calculateItemAction,
  statusForRequestedAction,
  statusAfterCompletedAction,
  isDeliveredEnoughForPostDeliveryAction,
  roundMoney,
} = require('../utils/orderItemActions');

const customerOwnsOrder = (order, user) => {
  const isOwnedByCustomerId = Number(order.customer_id) === Number(user?.id);
  const isLegacyOwnedByEmail = !order.customer_id
    && user?.email
    && String(order.customer_email || '').toLowerCase() === String(user.email).toLowerCase();
  return isOwnedByCustomerId || isLegacyOwnedByEmail;
};

const canCancelOrderItems = (order) => {
  const status = String(order?.status || '').toLowerCase();
  if (['cancelled', 'seller cancelled', 'delivered', 'shipped', 'out for delivery'].includes(status) || status.startsWith('rto ')) {
    return false;
  }
  const createdAt = new Date(order.createdAt).getTime();
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 24 * 60 * 60 * 1000;
};

const normalizeItems = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      orderItemId: Number(item.orderItemId || item.order_item_id || item.id),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }))
    .filter((item) => Number.isInteger(item.orderItemId) && item.quantity > 0);
};

const hasClosedOrActiveAction = (item, actionType) => {
  const actions = item?.OrderItemActions || [];
  return actions.some((action) => {
    const type = String(action.action_type || '').toLowerCase();
    const status = String(action.status || '').toLowerCase();
    return type === actionType && !['rejected', 'cancelled'].includes(status);
  });
};

const actionOrderStatus = (actionType) => {
  if (actionType === ACTION_TYPES.CANCEL) return 'Cancel Requested';
  if (actionType === ACTION_TYPES.RETURN) return 'Return Initiated';
  return 'Exchange Initiated';
};

const serializeAction = (action) => {
  const json = typeof action?.toJSON === 'function' ? action.toJSON() : action;
  return {
    ...json,
    item_amount: roundMoney(json.item_amount),
    forward_shipping_deduction: roundMoney(json.forward_shipping_deduction),
    reverse_shipping_deduction: roundMoney(json.reverse_shipping_deduction),
    estimated_refund_amount: roundMoney(json.estimated_refund_amount),
  };
};

class OrderItemActionController {
  async estimate(req, res) {
    try {
      await ensureOrderItemActionSchema();
      const actionType = normalizeActionType(req.body.actionType || req.body.action_type);
      if (!actionType) return res.status(400).json({ message: 'Please choose cancel, return or exchange.' });

      const order = await Order.findByPk(req.params.orderId, {
        include: [{ model: OrderItem, include: [OrderItemAction] }],
      });
      if (!order) return res.status(404).json({ message: 'Order not found.' });
      if (req.userRole !== 'admin' && !customerOwnsOrder(order, req.user)) {
        return res.status(403).json({ message: 'This order does not belong to this account.' });
      }

      if (actionType === ACTION_TYPES.CANCEL && !canCancelOrderItems(order)) {
        return res.status(400).json({ message: 'Cancellation is available only before dispatch and within 24 hours.' });
      }
      if ([ACTION_TYPES.RETURN, ACTION_TYPES.EXCHANGE].includes(actionType) && !isDeliveredEnoughForPostDeliveryAction(order)) {
        return res.status(400).json({ message: 'Return or exchange is available after delivery.' });
      }

      const selections = normalizeItems(req.body.items);
      const itemMap = new Map((order.OrderItems || []).map((item) => [Number(item.id), item]));
      const estimates = selections.map((selection) => {
        const item = itemMap.get(selection.orderItemId);
        if (!item) return null;
        if (
          [ACTION_TYPES.RETURN, ACTION_TYPES.EXCHANGE].includes(actionType)
          && hasClosedOrActiveAction(item, actionType)
        ) {
          return null;
        }
        const maxQuantity = getActionableQuantity(item);
        const quantity = Math.min(selection.quantity, maxQuantity);
        if (quantity < 1) return null;
        return {
          order_item_id: item.id,
          product_name: item.product_name,
          quantity,
          ...calculateItemAction({ order, item, actionType, quantity }),
        };
      }).filter(Boolean);

      return res.status(200).json({
        items: estimates,
        totals: estimates.reduce((sum, item) => ({
          item_amount: roundMoney(sum.item_amount + item.item_amount),
          forward_shipping_deduction: roundMoney(sum.forward_shipping_deduction + item.forward_shipping_deduction),
          reverse_shipping_deduction: roundMoney(sum.reverse_shipping_deduction + item.reverse_shipping_deduction),
          estimated_refund_amount: roundMoney(sum.estimated_refund_amount + item.estimated_refund_amount),
        }), { item_amount: 0, forward_shipping_deduction: 0, reverse_shipping_deduction: 0, estimated_refund_amount: 0 }),
      });
    } catch (error) {
      console.error('[OrderItemAction] estimate error:', error.message);
      return res.status(500).json({ message: 'Unable to calculate this request right now.' });
    }
  }

  async create(req, res) {
    const transaction = await sequelize.transaction();
    try {
      await ensureOrderItemActionSchema();
      const actionType = normalizeActionType(req.body.actionType || req.body.action_type);
      if (!actionType) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Please choose cancel, return or exchange.' });
      }

      const order = await Order.findByPk(req.params.orderId, {
        include: [{ model: OrderItem, include: [OrderItemAction] }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!order) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Order not found.' });
      }
      if (req.userRole !== 'admin' && !customerOwnsOrder(order, req.user)) {
        await transaction.rollback();
        return res.status(403).json({ message: 'This order does not belong to this account.' });
      }

      if (actionType === ACTION_TYPES.CANCEL && !canCancelOrderItems(order)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Cancellation is available only before dispatch and within 24 hours.' });
      }
      if ([ACTION_TYPES.RETURN, ACTION_TYPES.EXCHANGE].includes(actionType) && !isDeliveredEnoughForPostDeliveryAction(order)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Return or exchange is available after delivery.' });
      }

      const selections = normalizeItems(req.body.items);
      if (!selections.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Please select at least one product.' });
      }

      const itemMap = new Map((order.OrderItems || []).map((item) => [Number(item.id), item]));
      const reason = String(req.body.reason || '').trim();
      const createdActions = [];

      for (const selection of selections) {
        const item = itemMap.get(selection.orderItemId);
        if (!item) {
          await transaction.rollback();
          return res.status(404).json({ message: 'One selected product was not found in this order.' });
        }
        if (
          [ACTION_TYPES.RETURN, ACTION_TYPES.EXCHANGE].includes(actionType)
          && hasClosedOrActiveAction(item, actionType)
        ) {
          await transaction.rollback();
          return res.status(400).json({
            message: `${item.product_name || 'This product'} already has a ${actionType} request. Please choose another product.`,
          });
        }
        const maxQuantity = getActionableQuantity(item);
        if (selection.quantity > maxQuantity) {
          await transaction.rollback();
          return res.status(400).json({ message: `${item.product_name || 'This product'} has only ${maxQuantity} quantity available for this request.` });
        }

        const calculation = calculateItemAction({ order, item, actionType, quantity: selection.quantity });
        const action = await OrderItemAction.create({
          order_id: order.id,
          order_item_id: item.id,
          product_id: item.product_id,
          action_type: actionType,
          quantity: selection.quantity,
          status: ACTION_STATUS.INITIATED,
          reason,
          ...calculation,
          requested_by: req.userRole === 'admin' ? null : req.user?.id,
          meta: {
            customer_message: req.body.comments || null,
            sku: item.sku || null,
            color_id: item.colorId || item.color_id || null,
          },
        }, { transaction });

        await item.update({
          status: statusForRequestedAction(actionType),
          pending_action_quantity: Number(item.pending_action_quantity || 0) + selection.quantity,
        }, { transaction });

        createdActions.push(action);
      }

      const paymentMethod = String(order.payment_method || '').toUpperCase();
      const orderUpdate = { status: actionOrderStatus(actionType) };
      if (actionType === ACTION_TYPES.RETURN) {
        orderUpdate.refund_status = paymentMethod === 'COD' ? 'Bank Details Required' : 'Refund Pending';
        orderUpdate.refund_amount = roundMoney(createdActions.reduce((sum, action) => sum + Number(action.estimated_refund_amount || 0), 0));
        orderUpdate.refund_note = paymentMethod === 'COD'
          ? 'Customer bank details are required before manual refund.'
          : 'Refund will be processed back to the original prepaid payment method.';
      } else if (actionType === ACTION_TYPES.CANCEL && paymentMethod !== 'COD') {
        orderUpdate.refund_status = 'Refund Pending';
        orderUpdate.refund_amount = roundMoney(createdActions.reduce((sum, action) => sum + Number(action.estimated_refund_amount || 0), 0));
      }

      await order.update(orderUpdate, { transaction });
      await transaction.commit();

      return res.status(201).json({
        message: actionType === ACTION_TYPES.CANCEL
          ? 'Cancellation request submitted.'
          : actionType === ACTION_TYPES.RETURN
            ? 'Return request submitted.'
            : 'Exchange request submitted.',
        actions: createdActions.map(serializeAction),
      });
    } catch (error) {
      await transaction.rollback();
      console.error('[OrderItemAction] create error:', error.message);
      return res.status(500).json({ message: 'Unable to submit this request right now.' });
    }
  }

  async listAdmin(req, res) {
    try {
      await ensureOrderItemActionSchema();
      const where = {};
      const actionType = normalizeActionType(req.query.type);
      if (actionType) where.action_type = actionType;
      if (req.query.status) where.status = String(req.query.status);

      const actions = await OrderItemAction.findAll({
        where,
        include: [
          { model: Order, attributes: ['id', 'order_number', 'customer_name', 'customer_email', 'phone', 'payment_method', 'status', 'createdAt'] },
          {
            model: OrderItem,
            include: [
              { model: Product, attributes: ['id', 'name', 'slug', 'images'] },
              { model: Color, attributes: ['id', 'name', 'slug', 'hex_code'] },
            ],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      return res.status(200).json(actions.map(serializeAction));
    } catch (error) {
      console.error('[OrderItemAction] admin list error:', error.message);
      return res.status(500).json({ message: 'Unable to load requests right now.' });
    }
  }

  async updateAdminStatus(req, res) {
    const transaction = await sequelize.transaction();
    try {
      await ensureOrderItemActionSchema();
      const nextStatus = String(req.body.status || '').trim();
      if (!Object.values(ACTION_STATUS).includes(nextStatus)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Please choose a valid request status.' });
      }

      const action = await OrderItemAction.findByPk(req.params.actionId, {
        include: [OrderItem, Order],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!action) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Request not found.' });
      }
      if ([ACTION_STATUS.COMPLETED, ACTION_STATUS.REJECTED, ACTION_STATUS.CANCELLED].includes(action.status)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'This request has already been closed.' });
      }

      const item = action.OrderItem;
      if (!item) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Order item not found.' });
      }

      const quantity = Number(action.quantity || 0);
      const closesPendingQuantity = [ACTION_STATUS.COMPLETED, ACTION_STATUS.REJECTED, ACTION_STATUS.CANCELLED].includes(nextStatus);
      const pending = closesPendingQuantity
        ? Math.max(0, Number(item.pending_action_quantity || 0) - quantity)
        : Number(item.pending_action_quantity || 0);
      const itemUpdate = { pending_action_quantity: pending };

      if (nextStatus === ACTION_STATUS.COMPLETED) {
        if (action.action_type === ACTION_TYPES.CANCEL) {
          itemUpdate.cancelled_quantity = Number(item.cancelled_quantity || 0) + quantity;
        } else if (action.action_type === ACTION_TYPES.RETURN) {
          itemUpdate.returned_quantity = Number(item.returned_quantity || 0) + quantity;
        } else if (action.action_type === ACTION_TYPES.EXCHANGE) {
          itemUpdate.exchanged_quantity = Number(item.exchanged_quantity || 0) + quantity;
        }
      }

      const statusSource = { ...item.toJSON(), ...itemUpdate };
      itemUpdate.status = nextStatus === ACTION_STATUS.COMPLETED
        ? statusAfterCompletedAction(statusSource, action.action_type)
        : nextStatus === ACTION_STATUS.REJECTED || nextStatus === ACTION_STATUS.CANCELLED
          ? pending > 0 ? statusForRequestedAction(action.action_type) : 'Active'
          : statusForRequestedAction(action.action_type);

      await item.update(itemUpdate, { transaction });
      await action.update({
        status: nextStatus,
        reviewed_by: req.user?.id || null,
        reviewed_at: new Date(),
        meta: {
          ...(action.meta || {}),
          admin_note: req.body.note || null,
        },
      }, { transaction });

      await transaction.commit();
      return res.status(200).json({ message: 'Request updated.', action: serializeAction(action) });
    } catch (error) {
      await transaction.rollback();
      console.error('[OrderItemAction] admin update error:', error.message);
      return res.status(500).json({ message: 'Unable to update this request right now.' });
    }
  }
}

module.exports = new OrderItemActionController();
