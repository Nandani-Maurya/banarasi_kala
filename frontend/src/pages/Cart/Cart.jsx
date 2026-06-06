import { Icon } from "@iconify/react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import EmptyStateIcon from "../../components/EmptyStateIcon";
import { getProductStockInfo } from "../../utils/stockStatus";
import { getVariantSku } from "../../utils/itemCode";
import "./Cart.css";

const FREE_DELIVERY_MIN = Number(import.meta.env.VITE_FREE_DELIVERY_MIN) || 20000;

const calcDiscount = (mrp, sell) => {
  if (!mrp || !sell || Number(mrp) <= Number(sell)) return 0;
  return Math.round(((Number(mrp) - Number(sell)) / Number(mrp)) * 100);
};

const Cart = () => {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    getSubtotal,
  } = useCart();
  const { toggleWishlist, wishlist } = useWishlist();

  const subtotal = getSubtotal();
  const remaining = Math.max(0, FREE_DELIVERY_MIN - subtotal);
  const progress = Math.min(100, (subtotal / FREE_DELIVERY_MIN) * 100);

  const handleCartQuantityChange = async (item, nextQuantity) => {
    if (nextQuantity < 1) return;
    const stockInfo = getProductStockInfo(item, item.colorId);
    if (nextQuantity > stockInfo.quantity) {
      toast.error(`Only ${stockInfo.quantity} item${stockInfo.quantity === 1 ? "" : "s"} available for this product.`);
      return;
    }
    toast.success(`Quantity updated to ${nextQuantity}`);
    const result = await updateQuantity(item.id, nextQuantity, item.colorId);
    if (result && !result.success) {
      toast.error(result.message);
    }
  };

  const handleRemove = (item) => {
    removeFromCart(item.id, item.colorId);
    toast.success(`${item.name} removed from bag`);
  };

  const isWishlisted = (item) =>
    wishlist.some(w => Number(w.id) === Number(item.id));

  if (cart.length === 0) {
    return (
      <div className="cart-page min-h-screen">
        <div className="cart-empty-wrap">
          <EmptyStateIcon variant="cart" className="cart-empty-icon" />
          <h3 className="cart-empty-title">Your bag is currently empty</h3>
          <p className="cart-empty-sub">Explore our heritage collection to add items.</p>
          <Link to="/collection" className="cart-empty-btn">Shop Collections</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page min-h-screen">

      {/* ── Top bar ── */}
      <div className="cart-topbar">
        <div className="cart-topbar-inner">
          <div className="cart-topbar-left">
            <h1 className="cart-topbar-title">Your Cart <span className="cart-topbar-count">({cart.length})</span></h1>
            <span className="cart-topbar-sub">{cart.length} item{cart.length === 1 ? "" : "s"} in your bag</span>
          </div>
          <div className="cart-topbar-right">
            <div className="cart-topbar-subtotal-label">Subtotal ({cart.length} item{cart.length === 1 ? "" : "s"})</div>
            <div className="cart-topbar-subtotal-value">Rs. {subtotal.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>

      <div className="cart-body">

        {/* ── Checkout button ── */}
        <Link to="/checkout" className="cart-checkout-btn">
          PROCEED TO CHECKOUT
          <Icon icon="lucide:arrow-right" />
        </Link>

        {/* ── Items ── */}
        <div className="cart-items">
          {cart.map((item) => {
            const stockInfo = getProductStockInfo(item, item.colorId);
            const sku = getVariantSku(item, item.colorId, item.selectedColorName);
            const wishlisted = isWishlisted(item);
            const sell = Number(item.price || item.selling_price || 0);
            const mrp = Number(item.mrp_price || item.mrp || 0);
            const disc = calcDiscount(mrp, sell);
            return (
              <div key={`${item.id}-${item.colorId}`} className="cart-card">
                <Link to={`/product/${item.slug}`} className="cart-card-image" aria-label={item.name}>
                  <img src={item.image_url} alt={item.name} />
                </Link>

                <div className="cart-card-body">
                  <button
                    type="button"
                    className={`cart-card-wish${wishlisted ? " is-active" : ""}`}
                    onClick={() => toggleWishlist(item)}
                    aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                  >
                    <Icon icon={wishlisted ? "mdi:heart" : "lucide:heart"} />
                  </button>

                  <Link to={`/product/${item.slug}`} className="cart-card-name">{item.name}</Link>

                  {item.Material?.name && (
                    <span className="cart-card-material">{item.Material.name}</span>
                  )}

                  {item.selectedColorName && (
                    <span className="cart-card-color">
                      <span
                        className="cart-card-color-dot"
                        style={item.selectedColorHex ? { background: item.selectedColorHex } : {}}
                      />
                      {item.selectedColorName}
                    </span>
                  )}

                  {(stockInfo.isOutOfStock || stockInfo.isLowStock) && (
                    <p className={`cart-stock-note ${stockInfo.isOutOfStock ? "out" : "low"}`}>
                      {stockInfo.colorMessage || stockInfo.badge}
                    </p>
                  )}

                  <div className="cart-card-footer">
                    <div className="cart-card-price-row">
                      <span className="cart-card-price">Rs. {sell.toLocaleString("en-IN")}</span>
                      {mrp > sell && <span className="cart-card-mrp">Rs. {mrp.toLocaleString("en-IN")}</span>}
                      {disc > 0 && <span className="cart-card-off">{disc}% OFF</span>}
                    </div>
                    <div className="cart-card-controls">
                      <div className="cart-qty">
                        <button onClick={() => handleCartQuantityChange(item, item.quantity - 1)} aria-label="Decrease">
                          <Icon icon="lucide:minus" />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          onClick={() => handleCartQuantityChange(item, item.quantity + 1)}
                          disabled={stockInfo.isOutOfStock}
                          aria-label="Increase"
                        >
                          <Icon icon="lucide:plus" />
                        </button>
                      </div>
                      <button className="cart-card-delete" onClick={() => handleRemove(item)} aria-label="Remove item">
                        <Icon icon="lucide:trash-2" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Trust badges ── */}
        <div className="cart-trust">
          <div className="cart-trust-item">
            <Icon icon="lucide:shield-check" />
            <div>
              <strong>100% Authentic</strong>
              <span>Banarasi Sarees</span>
            </div>
          </div>
          <div className="cart-trust-divider" />
          <div className="cart-trust-item">
            <Icon icon="lucide:credit-card" />
            <div>
              <strong>Secure Payments</strong>
              <span>You Can Trust</span>
            </div>
          </div>
          <div className="cart-trust-divider" />
          <div className="cart-trust-item">
            <Icon icon="lucide:package" />
            <div>
              <strong>Easy Returns</strong>
              <span>Hassle Free</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Cart;
