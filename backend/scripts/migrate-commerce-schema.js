const { sequelize } = require("../src/config/db");
const { config } = require("../src/config/env");
const { DataTypes } = require("sequelize");
const { formatOrderNumber } = require("../src/utils/codes");

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
  const productsTable = { tableName: "products", schema };

  console.log(`[migration] schema: ${schema}`);
  await sequelize.authenticate();

  let orders = await queryInterface.describeTable(ordersTable);
  let orderItems = await queryInterface.describeTable(orderItemsTable);
  let products = await queryInterface.describeTable(productsTable);
  let changed = false;

  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "customer_id", { type: DataTypes.INTEGER, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "order_number", { type: DataTypes.STRING, allowNull: true, unique: true }) || changed;
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
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "selected_courier_data", { type: DataTypes.JSONB, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "cancelled_at", { type: DataTypes.DATE, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "refund_status", { type: DataTypes.STRING, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "refund_note", { type: DataTypes.TEXT, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "return_requested_at", { type: DataTypes.DATE, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, ordersTable, orders, "exchange_requested_at", { type: DataTypes.DATE, allowNull: true }) || changed;

  changed = await addColumnIfMissing(queryInterface, orderItemsTable, orderItems, "shipping_meta", { type: DataTypes.JSONB, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, orderItemsTable, orderItems, "sku", { type: DataTypes.STRING, allowNull: true }) || changed;
  changed = await addColumnIfMissing(queryInterface, productsTable, products, "variant_skus", { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }) || changed;
  changed = await addColumnIfMissing(queryInterface, productsTable, products, "height", { type: DataTypes.DECIMAL(4, 2), allowNull: true }) || changed;

  await sequelize.query(`
    UPDATE ${schema}.products
    SET sku = CONCAT('BKS', LPAD(id::text, 5, '0'))
    WHERE sku IS NULL OR sku = '' OR sku !~ '^BKS[0-9]{5}$';
  `);

  const [ordersWithoutNumbers] = await sequelize.query(`
    SELECT id, created_at
    FROM ${schema}.orders
    WHERE order_number IS NULL OR order_number = ''
    ORDER BY created_at ASC, id ASC;
  `);
  const dailyCounts = {};
  for (const order of ordersWithoutNumbers) {
    const createdAt = order.created_at ? new Date(order.created_at) : new Date();
    const key = createdAt.toISOString().slice(0, 10);
    dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    await sequelize.query(
      `UPDATE ${schema}.orders SET order_number = :orderNumber WHERE id = :id`,
      { replacements: { orderNumber: formatOrderNumber(createdAt, dailyCounts[key]), id: order.id } },
    );
  }

  await sequelize.query(`
    UPDATE ${schema}.products p
    SET variant_skus = COALESCE((
      SELECT jsonb_object_agg(
        stock.key,
        CONCAT(
          p.sku,
          '-',
          COALESCE(NULLIF(regexp_replace(lower(c.name), '[^a-z0-9]+', '-', 'g'), ''), CONCAT('color-', stock.key))
        )
      )
      FROM jsonb_each_text(p.color_stocks) stock
      LEFT JOIN ${schema}.colors c ON c.id = stock.key::int
      WHERE COALESCE(stock.value::int, 0) > 0
    ), '{}'::jsonb)
    WHERE p.variant_skus IS NULL OR p.variant_skus = '{}'::jsonb;
  `);

  await sequelize.query(`
    UPDATE ${schema}.order_items oi
    SET sku = COALESCE(
      NULLIF(oi.sku, ''),
      p.variant_skus ->> oi.color_id::text,
      CONCAT(
        p.sku,
        '-',
        COALESCE(
          NULLIF(regexp_replace(lower((SELECT c.name FROM ${schema}.colors c WHERE c.id = oi.color_id)), '[^a-z0-9]+', '-', 'g'), ''),
          CONCAT('color-', oi.color_id::text),
          'variant'
        )
      )
    )
    FROM ${schema}.products p
    WHERE oi.product_id = p.id
      AND (oi.sku IS NULL OR oi.sku = '');
  `);

  if (orderItems.item_code) {
    await queryInterface.removeColumn(orderItemsTable, "item_code");
    changed = true;
  }

  if (changed) {
    orders = await queryInterface.describeTable(ordersTable);
    orderItems = await queryInterface.describeTable(orderItemsTable);
    products = await queryInterface.describeTable(productsTable);
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
