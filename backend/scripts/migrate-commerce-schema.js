const { sequelize } = require("../src/config/db");
const { config } = require("../src/config/env");
const { DataTypes } = require("sequelize");

const addColumnIfMissing = async (queryInterface, table, columns, name, definition) => {
  if (columns[name]) return false;
  await queryInterface.addColumn(table, name, definition);
  return true;
};

const run = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const schema = config.dbSchema || "vns_saree";
  const ordersTable = { tableName: "orders", schema };
  const orderItemsTable = { tableName: "order_items", schema };

  console.log(`[migration] schema: ${schema}`);
  await sequelize.authenticate();

  let orders = await queryInterface.describeTable(ordersTable);
  let orderItems = await queryInterface.describeTable(orderItemsTable);
  let changed = false;

  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "customer_id", { type: DataTypes.INTEGER, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "subtotal_amount", { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "shipping_charge", { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "shipping_discount", { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "payment_fee", { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "payment_discount", { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "wallet_amount", { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "payable_amount", { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "payment_method", { type: DataTypes.STRING, allowNull: true, defaultValue: "Prepaid" }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "payment_status", { type: DataTypes.STRING, allowNull: true, defaultValue: "Paid" }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "shiprocket_order_id", { type: DataTypes.STRING, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "shiprocket_awb", { type: DataTypes.STRING, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "cancelled_at", { type: DataTypes.DATE, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "refund_status", { type: DataTypes.STRING, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "refund_note", { type: DataTypes.TEXT, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "return_requested_at", { type: DataTypes.DATE, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "exchange_requested_at", { type: DataTypes.DATE, allowNull: true }) || changed;

  changed = await addColumnIfMissing(queryInterface, orderItemsTable, orderItems, "shipping_meta", { type: DataTypes.JSONB, allowNull: true }) || changed;

  if (changed) {
    orders = await queryInterface.describeTable(ordersTable);
    orderItems = await queryInterface.describeTable(orderItemsTable);
  }

  console.log(`[migration] orders columns: ${Object.keys(orders).length}`);
  console.log(`[migration] order_items columns: ${Object.keys(orderItems).length}`);
  console.log(changed ? "[migration] commerce schema updated." : "[migration] commerce schema already up to date.");
};

run()
  .catch((error) => {
    console.error("[migration] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
