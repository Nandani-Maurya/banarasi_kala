const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Customer = require("./Customer");

const CustomerAddress = sequelize.define(
  "CustomerAddress",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Customer, key: "id" },
    },
    label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "India",
    },
    address_line1: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    address_line2: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    landmark: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    delivery_instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "customer_addresses",
    schema: "vns_saree",
    timestamps: true,
    underscored: true,
  },
);

Customer.hasMany(CustomerAddress, { foreignKey: "customer_id" });
CustomerAddress.belongsTo(Customer, { foreignKey: "customer_id" });

module.exports = CustomerAddress;
