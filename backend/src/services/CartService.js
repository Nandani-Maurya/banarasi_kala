const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Color = require("../models/Color");
const { AppError } = require("../utils/http");

const CART_PRODUCT_ATTRIBUTES = [
  "id",
  "sku",
  "variant_skus",
  "name",
  "slug",
  "selling_price",
  "mrp_price",
  "discount_percent",
  "images",
  "stock_quantity",
  "low_stock_threshold",
  "color_stocks",
  "status",
  "payment_options",
  "service_options",
  "weight",
  "length",
  "width",
];

class CartService {
  async getCart(customerId) {
    return await Cart.findAll({
      where: { customerId },
      include: [
        {
          model: Product,
          attributes: CART_PRODUCT_ATTRIBUTES,
        },
        {
          model: Color,
          attributes: ["id", "name", "slug", "hex_code"],
        },
      ],
    });
  }

  async addToCart(customerId, productId, quantity = 1, colorId = null) {
    const product = await Product.findByPk(productId, { attributes: ["id", "stock_quantity", "color_stocks", "status"] });
    if (!product) throw new AppError("Product not found", 404);
    if (product.status !== "active") throw new AppError("This product is currently unavailable.", 400);

    const colorStock = Number(product.color_stocks?.[colorId] ?? product.stock_quantity ?? 0);
    if (colorStock <= 0) throw new AppError("This product is out of stock.", 400);
    
    let cartItem = await Cart.findOne({
      where: { customerId, productId, colorId },
    });

    const newQuantity = (cartItem ? cartItem.quantity : 0) + quantity;
    if (newQuantity > colorStock) {
      const alreadyInBag = cartItem ? Number(cartItem.quantity || 0) : 0;
      const canAdd = Math.max(0, colorStock - alreadyInBag);
      throw new AppError(
        canAdd > 0
          ? `Only ${canAdd} more can be added. You already have ${alreadyInBag} in your bag.`
          : `You already have the available ${colorStock} item(s) in your bag.`,
        400
      );
    }

    if (cartItem) {
      cartItem.quantity = newQuantity;
      await cartItem.save();
    } else {
      cartItem = await Cart.create({
        customerId,
        productId,
        quantity,
        colorId
      });
    }

    return cartItem;
  }

  async updateQuantity(customerId, productId, quantity, colorId = null) {
    const product = await Product.findByPk(productId, { attributes: ["id", "stock_quantity", "color_stocks", "status"] });
    if (!product) throw new AppError("Product not found", 404);
    if (product.status !== "active") throw new AppError("This product is currently unavailable.", 400);
    const colorStock = Number(product.color_stocks?.[colorId] ?? product.stock_quantity ?? 0);
    if (colorStock <= 0) throw new AppError("This product is out of stock.", 400);

    if (quantity > colorStock) {
      throw new AppError(`Only ${colorStock} item(s) are available.`, 400);
    }

    const cartItem = await Cart.findOne({
      where: { customerId, productId, colorId },
    });

    if (!cartItem) {
      throw new AppError("Item not found in cart", 404);
    }

    cartItem.quantity = quantity;
    if (cartItem.quantity <= 0) {
      await cartItem.destroy();
      return null;
    }

    await cartItem.save();
    return cartItem;
  }

  async removeFromCart(customerId, productId) {
    return await Cart.destroy({
      where: { customerId, productId },
    });
  }

  async clearCart(customerId) {
    return await Cart.destroy({
      where: { customerId },
    });
  }
}

module.exports = new CartService();
