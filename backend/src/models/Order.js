const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  order_number: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  customer_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  customer_email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false
  },
  pincode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  subtotal_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  shipping_charge: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  shipping_discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  payment_fee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  payment_discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  coupon_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  wallet_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  payable_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'Pending'
  },
  delivered_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  state: {
    type: DataTypes.STRING,
    defaultValue: 'Uttar Pradesh'
  },
  payment_method: {
    type: DataTypes.STRING,
    defaultValue: 'Prepaid'
  },
  payment_status: {
    type: DataTypes.STRING,
    defaultValue: 'Paid'
  },
  shiprocket_order_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  shiprocket_awb: {
    type: DataTypes.STRING,
    allowNull: true
  },
  selected_courier_data: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  refund_status: {
    type: DataTypes.STRING,
    allowNull: true
  },
  refund_note: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  return_requested_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  exchange_requested_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  shiprocket_return_order_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  shiprocket_exchange_order_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  shiprocket_return_awb: {
    type: DataTypes.STRING,
    allowNull: true
  },
  shiprocket_exchange_awb: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'orders',
  schema: 'vns_saree',
  timestamps: true,
  underscored: true
});

module.exports = Order;
