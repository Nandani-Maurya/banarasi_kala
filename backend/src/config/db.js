const { Sequelize } = require("sequelize");
const { config } = require("./env");

const SYNC_DATABASE = false;
const SYNC_OPTIONS = { alter: true };

if (!config.databaseUrl) {
  console.error("CRITICAL ERROR: DATABASE_URL is not defined in environment variables.");
}

const shouldUseSsl = (url) => url.includes("supabase.co") || url.includes("render.com");

const sequelize = new Sequelize(config.databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: shouldUseSsl(config.databaseUrl) ? {
      require: true,
      rejectUnauthorized: false,
    } : false,
  },
  define: {
    schema: config.dbSchema,
    timestamps: false,
  },
});

const runSchemaSync = async () => {
  if (!SYNC_DATABASE) {
    console.log("Database schema sync skipped.");
    return;
  }

  console.log("Database schema sync started.");
  await sequelize.sync(SYNC_OPTIONS);
  console.log("Database schema synchronized.");
};

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("PostgreSQL connected successfully.");
    console.log(`Database schema: ${config.dbSchema}`);

    await sequelize.query(`
      ALTER TABLE vns_saree.orders ADD COLUMN IF NOT EXISTS shiprocket_return_order_id VARCHAR(255);
      ALTER TABLE vns_saree.orders ADD COLUMN IF NOT EXISTS shiprocket_exchange_order_id VARCHAR(255);
      ALTER TABLE vns_saree.orders ADD COLUMN IF NOT EXISTS shiprocket_return_awb VARCHAR(255);
      ALTER TABLE vns_saree.orders ADD COLUMN IF NOT EXISTS shiprocket_exchange_awb VARCHAR(255);
      ALTER TABLE vns_saree.orders ADD COLUMN IF NOT EXISTS selected_courier_data JSONB;
      ALTER TABLE vns_saree.orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(255);
      ALTER TABLE vns_saree.order_items ADD COLUMN IF NOT EXISTS sku VARCHAR(255);
      ALTER TABLE vns_saree.products ADD COLUMN IF NOT EXISTS variant_skus JSONB DEFAULT '{}'::jsonb;
    `).then(() => {
      console.log("Shiprocket reverse logistics database columns ensured successfully.");
    }).catch(err => {
      console.log("DB ALTER query skipped/failed:", err.message);
    });

    await runSchemaSync();
  
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
