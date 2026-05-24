const WishlistService = require("../services/WishlistService");
const { ok, asyncHandler } = require("../utils/http");

class WishlistController {
  getWishlist = asyncHandler(async (req, res) => {
    const items = await WishlistService.getWishlist(req.customer.id);
    return ok(res, items, "Wishlist fetched");
  });

  toggleWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.body;
    const result = await WishlistService.toggleWishlist(req.customer.id, productId);
    return ok(res, result, "Wishlist updated");
  });

  removeFromWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    await WishlistService.removeFromWishlist(req.customer.id, productId);
    return ok(res, null, "Item removed from wishlist");
  });
}

module.exports = new WishlistController();
