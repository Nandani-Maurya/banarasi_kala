import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import api from "../../utils/api";
import { API_ENDPOINTS } from "../../config/api";
import EmptyStateIcon from "../../components/EmptyStateIcon";
import "./Cart.css";

const Cart = () => {
  const { 
    cart, 
    removeFromCart, 
    updateQuantity, 
    getSubtotal, 
    appliedCoupon, 
    discountAmount, 
    applyCoupon, 
    removeCoupon 
  } = useCart();
  const { addToWishlist } = useWishlist();

  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [showCouponDrawer, setShowCouponDrawer] = useState(false);

  const subtotal = getSubtotal();
  const total = subtotal - discountAmount;

  useEffect(() => {
    const fetchCoupons = async () => {
      try {
        const res = await api.get(API_ENDPOINTS.coupons);
        setAvailableCoupons(res.data.filter(c => c.is_active));
      } catch (err) {
        console.error("Error fetching coupons:", err);
      }
    };
    fetchCoupons();
  }, []);

  const handleApplyCoupon = (coupon) => {
    const success = applyCoupon(coupon);
    if (success) setShowCouponDrawer(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F1E8] flex flex-col">
      <main className="flex-grow py-12 lg:py-20">
        <div className="w-full px-4 lg:px-12">
          <div className="mb-12 text-center animate-slide-up">
            <h1 className="text-4xl lg:text-5xl font-bold text-[#800020] mb-4 uppercase brand-font tracking-widest">
              Shopping Bag
            </h1>
            <div className="w-24 h-1 bg-[#D4AF37] mx-auto mb-4"></div>
            <p className="text-[#3D2817]/60 text-lg">
              Your selected pieces are ready for checkout.
            </p>
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-lg shadow-sm border border-[#D4AF37]/10">
              <EmptyStateIcon variant="cart" className="mx-auto mb-2" />
              <h3 className="brand-font text-2xl text-[#800020] mb-4">Your bag is currently empty</h3>
              <p className="text-gray-500 mb-8">Explore our heritage collection to add items.</p>
              <Link to="/collection" className="inline-block px-10 py-4 bg-[#800020] text-[#D4AF37] font-bold uppercase tracking-widest hover:bg-[#3D2817] transition-all">
                Shop Collections
              </Link>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-12 items-start">
              <div className="w-full lg:w-2/3 space-y-6">
                {cart.map((item, index) => {
                  const productName = item.name;

                  return (
                  <div key={`${item.id}-${item.colorId}`} className={`bg-white rounded-lg p-6 shadow-sm border border-[#D4AF37]/10 flex flex-col sm:flex-row items-center gap-6 item-row transition-all animate-slide-up cart-row-delay-${index % 8}`}>
                    <div className="w-32 h-40 flex-shrink-0 rounded overflow-hidden shadow-md">
                      <img src={item.image_url} alt={productName} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-grow text-center sm:text-left">
                      <h3 className="brand-font text-xl text-[#800020] mb-1">{productName}</h3>
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-4 font-semibold">
                        {item.Material?.name || "Pure Silk"} • 
                        {item.colorId && <span className="ml-1 text-[#D4AF37]">Color Code: {item.colorId} •</span>} 
                        SKU: VNS-{item.id}
                      </p>
                      <div className="flex items-center justify-center sm:justify-start space-x-4 text-sm font-medium">
                        <button onClick={() => addToWishlist(item)} className="text-gray-400 hover:text-[#800020] transition-colors">Save to Wishlist</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => removeFromCart(item.id, item.colorId)} className="text-red-700 hover:text-red-900 transition-colors">Remove</button>
                      </div>
                    </div>
                    <div className="flex flex-col items-center sm:items-end gap-4">
                      <span className="text-xl font-bold text-[#3D2817]">Rs. {Number(item.price).toLocaleString("en-IN")}</span>
                      <div className="flex items-center border border-[#D4AF37]/30 rounded-sm bg-white overflow-hidden">
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1, item.colorId)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#800020] transition-colors"><Icon icon="lucide:minus" /></button>
                        <input type="number" value={item.quantity} readOnly className="w-10 text-center text-sm font-bold bg-transparent outline-none border-none" />
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1, item.colorId)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#800020] transition-colors"><Icon icon="lucide:plus" /></button>
                      </div>
                    </div>
                  </div>
                  );
                })}
                <div className="pt-8 flex flex-col sm:flex-row gap-6 border-t border-[#D4AF37]/20">
                  <div className="flex items-center space-x-3 opacity-60">
                    <Icon icon="lucide:truck" className="text-2xl text-[#800020]" />
                    <span className="text-xs font-semibold tracking-wider uppercase">Complimentary Worldwide Shipping</span>
                  </div>
                  <div className="flex items-center space-x-3 opacity-60">
                    <Icon icon="lucide:lock" className="text-2xl text-[#800020]" />
                    <span className="text-xs font-semibold tracking-wider uppercase">100% Secure Checkout</span>
                  </div>
                </div>
              </div>

              <aside className="w-full lg:w-1/3 animate-slide-up sticky top-28 cart-summary-delay">
                <div className="bg-white p-8 rounded-lg shadow-xl border-t-4 border-[#800020]">
                  <h2 className="brand-font text-2xl text-[#3D2817] mb-8 uppercase tracking-wider font-bold">Order Summary</h2>
                  
                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-[#3D2817]/70">
                      <span>Subtotal ({cart.length} items)</span>
                      <span className="font-semibold">Rs. {subtotal.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-[#3D2817]/70">
                      <span>Shipping</span>
                      <span className="text-green-700 font-bold uppercase tracking-widest text-[10px]">FREE DELIVERY</span>
                    </div>

                    {appliedCoupon && (
                      <div className="flex justify-between text-emerald-600 font-bold items-center py-2 px-3 bg-emerald-50 rounded-lg border border-emerald-100">
                        <div className="flex items-center gap-2">
                          <Icon icon="lucide:ticket" />
                          <span className="text-xs uppercase">{appliedCoupon.code}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm">-Rs. {discountAmount.toLocaleString("en-IN")}</span>
                          <button onClick={removeCoupon} className="text-gray-400 hover:text-red-500"><Icon icon="lucide:x" /></button>
                        </div>
                      </div>
                    )}
                    
                    <div className="pt-6 border-t border-[#D4AF37]/30">
                      <div className="flex justify-between items-baseline text-3xl font-black text-[#800020] mb-2">
                        <span className="brand-font uppercase tracking-tighter">Final Total</span>
                        <span>Rs. {total.toLocaleString("en-IN")}</span>
                      </div>
                      
                      <div className="flex flex-col gap-1.5 mt-4 pt-4 border-t border-dashed border-[#D4AF37]/20">
                        <div className="flex items-center space-x-2 text-emerald-700">
                          <Icon icon="lucide:check-circle" className="text-xs" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Price Inclusive of 5% GST</span>
                        </div>
                        <div className="flex items-center space-x-2 text-[#B8860B]">
                          <Icon icon="lucide:globe" className="text-xs" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Complimentary Worldwide Shipping</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {!appliedCoupon && (
                    <div className="mb-10">
                      <button 
                        onClick={() => setShowCouponDrawer(true)}
                        className="w-full flex items-center justify-between px-4 py-4 border-2 border-dashed border-[#D4AF37]/40 rounded-lg text-[#800020] hover:border-[#800020] transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <Icon icon="lucide:ticket" className="text-xl group-hover:animate-bounce" />
                          <span className="text-xs font-black uppercase tracking-widest">Apply Coupon Code</span>
                        </div>
                        <Icon icon="lucide:chevron-right" />
                      </button>
                    </div>
                  )}

                  <Link to="/checkout" className="checkout-btn-3d w-full py-5 bg-[#800020] text-[#D4AF37] font-bold text-lg uppercase tracking-[0.2em] shadow-lg border border-[#800020] flex items-center justify-center space-x-3 rounded-sm hover:-translate-y-1 transition-transform">
                    <span>Proceed to Checkout</span>
                    <Icon icon="lucide:arrow-right" className="text-xl" />
                  </Link>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>

      {showCouponDrawer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCouponDrawer(false)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slide-left">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-[#800020] text-[#D4AF37]">
              <h3 className="brand-font text-xl font-bold uppercase tracking-widest">Available Offers</h3>
              <button onClick={() => setShowCouponDrawer(false)} className="text-2xl"><Icon icon="lucide:x" /></button>
            </div>
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              {availableCoupons.length === 0 ? (
                <div className="text-center py-10 opacity-50">No coupons available right now.</div>
              ) : (
                availableCoupons.map(coupon => (
                  <div key={coupon.id} className="relative border-2 border-[#D4AF37]/20 rounded-xl p-5 hover:border-[#800020] transition-all group overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="block text-lg font-black text-[#800020] mb-1">{coupon.code}</span>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{coupon.description}</p>
                      </div>
                      <button onClick={() => handleApplyCoupon(coupon)} className="bg-[#800020] text-[#D4AF37] text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest hover:scale-105 transition-transform">Apply</button>
                    </div>
                    <div className="space-y-2 pt-4 border-t border-dashed border-gray-100">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-[#3D2817]/60 uppercase tracking-tighter"><Icon icon="lucide:info" /><span>Save {coupon.discount_type === 'percentage' ? `${coupon.discount_percent}%` : `Rs. ${Number(coupon.discount_amount).toLocaleString("en-IN")}`} on this order</span></div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-[#3D2817]/60 uppercase tracking-tighter"><Icon icon="lucide:shopping-cart" /><span>Min purchase: Rs. {Number(coupon.min_purchase_amount).toLocaleString("en-IN")}</span></div>
                      {/* Restore the 3rd line for applicability */}
                      {(coupon.applicable_variety_id?.length > 0 || coupon.applicable_product_id?.length > 0) && (
                        <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">
                          <Icon icon="lucide:check-circle" />
                          <span>Valid on specific Saree Collections</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute top-1/2 -left-3 w-6 h-6 bg-[#F5F1E8] rounded-full border-r-2 border-[#D4AF37]/20 -translate-y-1/2" />
                    <div className="absolute top-1/2 -right-3 w-6 h-6 bg-[#F5F1E8] rounded-full border-l-2 border-[#D4AF37]/20 -translate-y-1/2" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cart;

