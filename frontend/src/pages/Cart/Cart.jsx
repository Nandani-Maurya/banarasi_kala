import { Icon } from "@iconify/react";
import { Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useNotification } from "../../context/NotificationContext";
import EmptyStateIcon from "../../components/EmptyStateIcon";
import { getProductStockInfo } from "../../utils/stockStatus";
import { getVariantSku } from "../../utils/itemCode";
import "./Cart.css";

const Cart = () => {
  const { 
    cart, 
    removeFromCart, 
    updateQuantity, 
    getSubtotal,
  } = useCart();
  const { toggleWishlist } = useWishlist();
  const { showNotification } = useNotification();

  const subtotal = getSubtotal();
  const total = subtotal;

  const handleCartQuantityChange = async (item, nextQuantity) => {
    if (nextQuantity < 1) return;
    const stockInfo = getProductStockInfo(item, item.colorId);
    if (nextQuantity > stockInfo.quantity) {
      showNotification(`Only ${stockInfo.quantity} item${stockInfo.quantity === 1 ? "" : "s"} are available for this product.`, "warning");
      return;
    }

    const result = await updateQuantity(item.id, nextQuantity, item.colorId);
    if (result && !result.success) showNotification(result.message, "warning");
  };

  return (
    <div className="cart-page min-h-screen bg-[#F5F1E8] flex flex-col">
      <section className="cart-hero animate-slide-up">
        <div className="cart-hero-content">
          <h1 className="brand-font">
            <span className="cart-title-bag"><Icon icon="lucide:shopping-bag" /></span>
            Your Cart
          </h1>
          <p>{cart.length ? `${cart.length} item${cart.length === 1 ? "" : "s"} in your bag` : "Your bag is empty"}</p>
        </div>
      </section>
      <main className="flex-grow py-8 lg:py-10">
        <div className="cart-container w-full px-4 lg:px-12">

          {cart.length === 0 ? (
            <div className="cart-empty text-center py-20 bg-white rounded-lg shadow-sm border border-[#D4AF37]/10">
              <EmptyStateIcon variant="cart" className="mx-auto mb-2" />
              <h3 className="brand-font text-2xl text-[#800020] mb-4">Your bag is currently empty</h3>
              <p className="text-gray-500 mb-8">Explore our heritage collection to add items.</p>
              <Link to="/collection" className="inline-block px-10 py-4 bg-[#800020] text-[#D4AF37] font-bold uppercase tracking-widest hover:bg-[#3D2817] transition-all">
                Shop Collections
              </Link>
            </div>
          ) : (
            <div className="cart-layout flex flex-col lg:flex-row gap-12 items-start">
              <div className="cart-items w-full lg:w-2/3 space-y-6">
                {cart.map((item, index) => {
                  const productName = item.name;
                  const variantSku = getVariantSku(item, item.colorId, item.selectedColorSlug || item.selectedColorName);

                return (
                  (() => {
                    const stockInfo = getProductStockInfo(item, item.colorId);
                    const isBlocked = stockInfo.isOutOfStock;
                    return (
                  <div key={`${item.id}-${item.colorId}`} className={`cart-item-card bg-white rounded-lg p-6 shadow-sm border border-[#D4AF37]/10 flex flex-col sm:flex-row items-center gap-6 item-row transition-all animate-slide-up cart-row-delay-${index % 8}`}>
                    <Link to={`/product/${item.slug}`} className="cart-item-image w-32 h-40 flex-shrink-0 rounded overflow-hidden shadow-md" aria-label={`Open ${productName}`}>
                      <img src={item.image_url} alt={productName} className="w-full h-full object-cover" />
                    </Link>
                    <div className="cart-item-info flex-grow text-center sm:text-left">
                      <Link to={`/product/${item.slug}`} className="cart-item-title-link">
                        <h3 className="brand-font text-xl text-[#800020] mb-1">{productName}</h3>
                      </Link>
                      <div className="cart-item-meta text-xs text-gray-500 uppercase tracking-widest mb-4 font-semibold">
                        <span>{item.Material?.name || "Pure Silk"}</span>
                        {item.selectedColorName && <span>{item.selectedColorName}</span>}
                        {variantSku && <span>SKU: {variantSku}</span>}
                      </div>
                      {(stockInfo.isOutOfStock || stockInfo.isLowStock) && (
                        <p className={`cart-stock-note ${stockInfo.isOutOfStock ? "out" : "low"}`}>
                          {stockInfo.colorMessage || stockInfo.badge}
                        </p>
                      )}
                      <div className="cart-item-actions flex items-center justify-center sm:justify-start space-x-4 text-sm font-medium">
                        <button onClick={() => toggleWishlist(item)} className="text-gray-400 hover:text-[#800020] transition-colors">Save to Wishlist</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => removeFromCart(item.id, item.colorId)} className="text-red-700 hover:text-red-900 transition-colors">Remove</button>
                      </div>
                    </div>
                    <div className="cart-item-side flex flex-col items-center sm:items-end gap-4">
                      <span className="cart-item-price text-xl font-bold text-[#3D2817]">Rs. {Number(item.price).toLocaleString("en-IN")}</span>
                      <div className="cart-qty-control flex items-center border border-[#D4AF37]/30 rounded-sm bg-white overflow-hidden">
                        <button onClick={() => handleCartQuantityChange(item, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#800020] transition-colors"><Icon icon="lucide:minus" /></button>
                        <input type="number" value={item.quantity} readOnly className="w-10 text-center text-sm font-bold bg-transparent outline-none border-none" />
                        <button
                          onClick={() => handleCartQuantityChange(item, item.quantity + 1)}
                          disabled={isBlocked}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#800020] transition-colors disabled:opacity-40"
                        >
                          <Icon icon="lucide:plus" />
                        </button>
                      </div>
                    </div>
                  </div>
                    );
                  })()
                );
                })}
              </div>

              <aside className="cart-summary w-full lg:w-1/3 animate-slide-up sticky top-28 cart-summary-delay">
                <div className="cart-summary-panel bg-white p-8 rounded-lg shadow-xl border-t-4 border-[#800020]">
                  <h2 className="brand-font text-2xl text-[#3D2817] mb-8 uppercase tracking-wider font-bold">Order Summary</h2>
                  
                  <div className="cart-summary-lines space-y-4 mb-8">
                    <div className="cart-summary-row flex justify-between text-[#3D2817]/70">
                      <span>Subtotal ({cart.length} items)</span>
                      <span className="font-semibold">Rs. {subtotal.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="cart-summary-row flex justify-between text-[#3D2817]/70">
                      <span>Shipping</span>
                      <span>Calculated at checkout</span>
                    </div>
                    
                    <div className="cart-summary-total-wrap pt-6 border-t border-[#D4AF37]/30">
                      <div className="cart-final-total flex justify-between items-baseline text-3xl font-black text-[#800020] mb-2">
                        <span className="brand-font uppercase tracking-tighter">Total</span>
                        <span>Rs. {total.toLocaleString("en-IN")}</span>
                      </div>
                      
                      <div className="cart-summary-notes flex flex-col gap-1.5 mt-4 pt-4 border-t border-dashed border-[#D4AF37]/20">
                        <div className="flex items-center space-x-2 text-emerald-700">
                          <Icon icon="lucide:check-circle" className="text-xs" />
                          <span>Inclusive of all taxes</span>
                        </div>
                        <div className="flex items-center space-x-2 text-[#B8860B]">
                          <Icon icon="lucide:ticket" className="text-xs" />
                          <span>Coupons, wallet and shipping are applied at checkout.</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Link to="/checkout" className="cart-checkout-btn checkout-btn-3d w-full py-5 bg-[#800020] text-[#D4AF37] font-bold text-lg uppercase tracking-[0.2em] shadow-lg border border-[#800020] flex items-center justify-center space-x-3 rounded-sm hover:-translate-y-1 transition-transform">
                    <span>Proceed to Checkout</span>
                    <Icon icon="lucide:arrow-right" className="text-xl" />
                  </Link>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>

    </div>
  );
};

export default Cart;
