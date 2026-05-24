import { Icon } from "@iconify/react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import { API_ENDPOINTS } from "../../config/api";
import { validateCheckoutForm } from "../../utils/validation";
import "./Checkout.css";

const Checkout = () => {
  const { cart, getSubtotal, clearCart, appliedCoupon, discountAmount } = useCart();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const isCodAllowed = cart.every(item => Array.isArray(item.payment_options) && item.payment_options.includes("cod"));
  const [activePayment, setActivePayment] = useState("online");
  const [loading, setLoading] = useState(false);
  const [shippingCharge, setShippingCharge] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);
  const rootRef = useRef(null);

  const [formData, setFormData] = useState({
    fullName: user?.name || "",
    email: user?.email || "",
    address: "",
    city: "",
    pincode: "",
    phone: user?.phone || "",
  });

  const subtotal = getSubtotal();
  const total = subtotal - discountAmount + shippingCharge;
  const totalWeightKg = cart.reduce((sum, item) => {
    const rawWeight = Number(item.weight);
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      return sum + (0.5 * Number(item.quantity || 1));
    }
    const weightKg = rawWeight > 5 ? rawWeight / 1000 : rawWeight;
    return sum + (weightKg * Number(item.quantity || 1));
  }, 0);

  useEffect(() => {
    if (cart.length === 0) {
      navigate("/cart");
    }
    if (rootRef.current) {
      const sections = rootRef.current.querySelectorAll("section");
      sections.forEach((section, index) => {
        setTimeout(() => {
          section.classList.add("reveal");
        }, index * 100);
      });
    }
  }, [cart, navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const cleanPincode = formData.pincode.trim();
    if (!/^\d{6}$/.test(cleanPincode) || cart.length === 0) {
      setShippingCharge(0);
      setShippingLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setShippingLoading(true);
        const effectiveWeight = Math.max(0.1, Number(totalWeightKg.toFixed(3)));
        const response = await fetch(
          `${API_ENDPOINTS.shiprocket}/serviceability?pincode=${encodeURIComponent(cleanPincode)}&weight=${effectiveWeight}&is_cod=${activePayment === "cod" ? 1 : 0}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch shipping rates");
        }

        const data = await response.json();
        const couriers = data?.data?.available_courier_companies || [];
        const rateValues = couriers
          .map((c) => Number(c?.rate ?? c?.freight_charge ?? c?.courier_charge))
          .filter((v) => Number.isFinite(v) && v >= 0);
        const bestRate = rateValues.length ? Math.min(...rateValues) : 0;

        if (!cancelled) {
          setShippingCharge(bestRate);
        }
      } catch (error) {
        if (!cancelled) {
          setShippingCharge(0);
        }
      } finally {
        if (!cancelled) {
          setShippingLoading(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.pincode, cart, totalWeightKg, activePayment]);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    const { isValid, errors } = validateCheckoutForm(formData);
    if (!isValid) {
      showNotification(`Please fix: ${Object.values(errors).join(" | ")}`, "warning");
      return;
    }

    setLoading(true);
    try {
      const finalOrderData = {
        customer_name: formData.fullName,
        customer_email: formData.email,
        address: formData.address,
        city: formData.city,
        pincode: formData.pincode,
        phone: formData.phone,
        total_amount: total,
        coupon_code: appliedCoupon?.code || null,
        discount_amount: discountAmount,
        payment_method: activePayment === 'cod' ? 'COD' : 'Prepaid',
        payment_status: activePayment === 'cod' ? 'Pending' : 'Paid',
        items: cart.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          colorId: item.colorId
        })),
      };

      if (activePayment === "cod") {
        // Direct order creation for Cash on Delivery (bypassing Razorpay)
        const dbRes = await fetch(API_ENDPOINTS.orders, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalOrderData),
        });

        if (dbRes.ok) {
          clearCart();
          navigate("/order-confirmation");
        } else {
          const errData = await dbRes.json();
          showNotification(errData.message || "Failed to place COD order.", "error");
        }
      } else {
        // Online Payment via Razorpay
        const orderResponse = await fetch(API_ENDPOINTS.razorpay.createOrder, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: total }),
        });
        const rzpOrder = await orderResponse.json();

        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: rzpOrder.amount,
          currency: "INR",
          name: "Banaras Heritage",
          description: "Heritage Saree Purchase",
          order_id: rzpOrder.id,
          handler: async function (response) {
            const verifyRes = await fetch(API_ENDPOINTS.razorpay.verifyPayment, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();

            if (verifyData.success) {
              const dbRes = await fetch(API_ENDPOINTS.orders, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalOrderData),
              });

              if (dbRes.ok) {
                clearCart();
                navigate("/order-confirmation");
              }
            }
          },
          prefill: { name: formData.fullName, email: formData.email, contact: formData.phone },
          theme: { color: "#800020" },
        };

        const rzp1 = new window.Razorpay(options);
        rzp1.open();
      }
    } catch (err) {
      console.error(err);
      showNotification("Error initiating payment or order.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-[#F5F1E8]" ref={rootRef}>
      <main className="flex-grow py-12 lg:py-20">
        <div className="w-full px-4 lg:px-12">
          <div className="flex items-center justify-center mb-16 space-x-4 md:space-x-12 animate-slide-up">
            <div className="flex items-center space-x-3">
              <span className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm border border-green-200"><Icon icon="lucide:check" /></span>
              <span className="text-sm font-bold uppercase tracking-widest text-gray-500 hidden md:block">Cart</span>
            </div>
            <div className="w-12 h-px bg-gray-300"></div>
            <div className="flex items-center space-x-3">
              <span className="w-10 h-10 rounded-full bg-[#800020] text-[#D4AF37] flex items-center justify-center font-bold text-sm shadow-lg">2</span>
              <span className="text-sm font-bold uppercase tracking-widest text-[#800020]">Checkout</span>
            </div>
            <div className="w-12 h-px bg-gray-300"></div>
            <div className="flex items-center space-x-3 opacity-40">
              <span className="w-10 h-10 rounded-full bg-white text-gray-400 flex items-center justify-center font-bold text-sm border border-gray-300">3</span>
              <span className="text-sm font-bold uppercase tracking-widest text-gray-500 hidden md:block">Confirmation</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-8 space-y-12">
              {/* RESTORED SHIPPING DETAILS FORM */}
              <section className="bg-white rounded-2xl p-8 shadow-sm border border-[#D4AF37]/10 checkout-section">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold text-[#3D2817] flex items-center brand-font">
                    <Icon icon="lucide:truck" className="mr-3 text-[#D4AF37]"></Icon>
                    Shipping Details
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="checkout-input-group">
                    <label className="block text-xs font-bold text-[#3D2817]/60 uppercase tracking-widest mb-2">Full Name</label>
                    <div className="checkout-input-inner">
                      <input name="fullName" value={formData.fullName} onChange={handleInputChange} type="text" placeholder="Ananya Sharma" className="w-full bg-[#F5F1E8]/50 border border-[#D4AF37]/30 rounded-lg px-4 py-3 focus:outline-none focus:border-[#800020]" />
                    </div>
                  </div>
                  <div className="checkout-input-group">
                    <label className="block text-xs font-bold text-[#3D2817]/60 uppercase tracking-widest mb-2">Email Address</label>
                    <div className="checkout-input-inner">
                      <input name="email" value={formData.email} onChange={handleInputChange} type="email" placeholder="ananya@example.com" className="w-full bg-[#F5F1E8]/50 border border-[#D4AF37]/30 rounded-lg px-4 py-3 focus:outline-none focus:border-[#800020]" />
                    </div>
                  </div>
                  <div className="checkout-input-group md:col-span-2">
                    <label className="block text-xs font-bold text-[#3D2817]/60 uppercase tracking-widest mb-2">Street Address</label>
                    <div className="checkout-input-inner">
                      <input name="address" value={formData.address} onChange={handleInputChange} type="text" placeholder="House No. 123, Heritage Lane" className="w-full bg-[#F5F1E8]/50 border border-[#D4AF37]/30 rounded-lg px-4 py-3 focus:outline-none focus:border-[#800020]" />
                    </div>
                  </div>
                  <div className="checkout-input-group">
                    <label className="block text-xs font-bold text-[#3D2817]/60 uppercase tracking-widest mb-2">City</label>
                    <div className="checkout-input-inner">
                      <input name="city" value={formData.city} onChange={handleInputChange} type="text" placeholder="Varanasi" className="w-full bg-[#F5F1E8]/50 border border-[#D4AF37]/30 rounded-lg px-4 py-3 focus:outline-none focus:border-[#800020]" />
                    </div>
                  </div>
                  <div className="checkout-input-group">
                    <label className="block text-xs font-bold text-[#3D2817]/60 uppercase tracking-widest mb-2">Postal Code</label>
                    <div className="checkout-input-inner">
                      <input name="pincode" value={formData.pincode} onChange={handleInputChange} type="text" placeholder="221001" className="w-full bg-[#F5F1E8]/50 border border-[#D4AF37]/30 rounded-lg px-4 py-3 focus:outline-none focus:border-[#800020]" />
                    </div>
                  </div>
                  <div className="checkout-input-group">
                    <label className="block text-xs font-bold text-[#3D2817]/60 uppercase tracking-widest mb-2">Phone Number</label>
                    <div className="checkout-input-inner">
                      <input name="phone" value={formData.phone} onChange={handleInputChange} type="tel" placeholder="+91 98765 43210" className="w-full bg-[#F5F1E8]/50 border border-[#D4AF37]/30 rounded-lg px-4 py-3 focus:outline-none focus:border-[#800020]" />
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl p-8 shadow-sm border border-[#D4AF37]/10 checkout-section">
                <h2 className="text-2xl font-bold text-[#3D2817] mb-8 flex items-center brand-font">
                  <Icon icon="lucide:credit-card" className="mr-3 text-[#D4AF37]" />
                  Payment Options
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Online Payment Option */}
                  <div 
                    className={`payment-card cursor-pointer group`} 
                    onClick={() => setActivePayment("online")}
                  >
                    <div className={`p-6 border-2 rounded-xl flex flex-col items-center transition-all ${activePayment === "online" ? "border-[#800020] bg-white shadow-lg" : "border-[#D4AF37]/10 bg-[#F5F1E8]/30"}`}>
                      <Icon icon="lucide:shield-check" className={`text-3xl mb-4 ${activePayment === "online" ? "text-[#800020]" : "text-[#D4AF37]"}`} />
                      <span className="font-bold text-[#3D2817]">Online Payment</span>
                      <p className="text-[10px] text-gray-500 mt-2 text-center">Pay securely using Cards, UPI, NetBanking (via Razorpay)</p>
                    </div>
                  </div>

                  {/* Cash on Delivery (COD) Option */}
                  <div 
                    className={`payment-card cursor-pointer group ${!isCodAllowed ? "opacity-50 cursor-not-allowed" : ""}`} 
                    onClick={() => {
                      if (isCodAllowed) {
                        setActivePayment("cod");
                      } else {
                        showNotification("Some products in your cart do not support Cash on Delivery.", "warning");
                      }
                    }}
                  >
                    <div className={`p-6 border-2 rounded-xl flex flex-col items-center transition-all ${activePayment === "cod" ? "border-[#800020] bg-white shadow-lg" : "border-[#D4AF37]/10 bg-[#F5F1E8]/30"}`}>
                      <Icon icon="lucide:hand-coins" className={`text-3xl mb-4 ${activePayment === "cod" ? "text-[#800020]" : "text-[#D4AF37]"}`} />
                      <span className="font-bold text-[#3D2817]">Cash on Delivery (COD)</span>
                      {!isCodAllowed ? (
                        <p className="text-[10px] text-red-500 mt-2 text-center">Unavailable: Contains prepaid-only items</p>
                      ) : (
                        <p className="text-[10px] text-gray-500 mt-2 text-center">Pay with cash when your package is delivered</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="lg:col-span-4">
              <div className="summary-card sticky top-28">
                <div className="bg-white rounded-2xl p-8 shadow-xl border border-[#D4AF37]/20">
                  <h3 className="text-xl font-bold text-[#3D2817] mb-8 uppercase tracking-widest border-b border-[#D4AF37]/10 pb-4 brand-font">Order Summary</h3>
                  <div className="space-y-6 mb-8">
                    {cart.map((item) => {
                      const productName = item.name;

                      return (
                      <div key={`${item.id}-${item.colorId}`} className="flex items-center space-x-4">
                        <div className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-[#F5F1E8]"><img src={item.image_url} className="w-full h-full object-cover" alt={productName} /></div>
                        <div className="flex-grow">
                          <h4 className="text-xs font-bold text-[#3D2817] tracking-wider">{productName}</h4>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest">{item.quantity} x Rs. {Number(item.price).toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                      );
                    })}
                  </div>

                  <div className="pt-6 border-t border-[#D4AF37]/10 space-y-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 uppercase tracking-widest font-bold">Subtotal</span>
                      <span className="font-bold text-[#3D2817]">Rs. {subtotal.toLocaleString("en-IN")}</span>
                    </div>

                    {appliedCoupon && (
                      <div className="flex justify-between items-center text-xs text-emerald-600 font-bold">
                        <div className="flex items-center gap-1"><Icon icon="lucide:ticket" /><span>COUPON ({appliedCoupon.code})</span></div>
                        <span>-Rs. {discountAmount.toLocaleString("en-IN")}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 uppercase tracking-widest font-bold">Shipping</span>
                      <span className={`font-bold ${shippingCharge > 0 ? "text-[#3D2817]" : "text-green-600"}`}>
                        {shippingLoading
                          ? "CALCULATING..."
                          : shippingCharge > 0
                            ? `₹${shippingCharge.toLocaleString("en-IN")}`
                            : "FREE DELIVERY"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-10 pt-6 border-t-2 border-[#D4AF37]/20">
                    <div className="flex justify-between items-center mb-8">
                      <span className="text-sm font-bold text-[#3D2817] uppercase tracking-[0.2em]">Total Payable</span>
                      <span className="text-2xl font-bold text-[#800020]">Rs. {total.toLocaleString("en-IN")}</span>
                    </div>
                    
                    <div className="flex flex-col items-end mb-6">
                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Inclusive of all taxes</p>
                    </div>

                    <button onClick={handlePlaceOrder} disabled={loading} className={`w-full py-5 bg-[#800020] text-[#D4AF37] font-bold rounded-xl shadow-2xl transition-all transform hover:scale-[1.02] uppercase tracking-[0.2em] text-sm ${loading ? "opacity-70" : "gold-btn-shimmer"}`}>
                      {loading ? "PROCESSING..." : "PLACE SECURE ORDER"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Checkout;
