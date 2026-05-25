import { Icon } from "@iconify/react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import { API_ENDPOINTS } from "../../config/api";
import api from "../../utils/api";
import { validateCheckoutForm } from "../../utils/validation";
import { LocationPickerModal } from "../Profile/Profile";
import "./Checkout.css";

const PACKAGING_WEIGHT_KG = Number(import.meta.env.VITE_PACKAGING_WEIGHT_KG || 0.7);
const COD_MAX_AMOUNT = Number(import.meta.env.VITE_COD_MAX_AMOUNT || 10000);
const FREE_SHIPPING_MIN_AMOUNT = Number(import.meta.env.VITE_FREE_SHIPPING_MIN_AMOUNT || 10000);
const PREPAID_DISCOUNT_AMOUNT = Number(import.meta.env.VITE_PREPAID_DISCOUNT_AMOUNT || 50);
const COD_FEE_AMOUNT = Number(import.meta.env.VITE_COD_FEE_AMOUNT || 50);
const EMPTY_CHECKOUT_ADDRESS = {
  label: "Home",
  name: "",
  phone: "",
  alternate_phone: "",
  country: "India",
  state: "Uttar Pradesh",
  city: "",
  pincode: "",
  house_building: "",
  area_street: "",
  landmark: "",
  map_address: "",
  map_lat: "",
  map_lng: "",
  is_default: false,
};

const getEmptyCheckoutAddress = (user) => ({
  ...EMPTY_CHECKOUT_ADDRESS,
  name: user?.name || "",
  phone: user?.phone || "",
});

const cleanCheckoutAddress = (address = {}) => ({
  ...EMPTY_CHECKOUT_ADDRESS,
  ...address,
  phone: String(address.phone || "").replace(/[^\d+]/g, ""),
  pincode: String(address.pincode || "").replace(/\D/g, "").slice(0, 6),
});

const getCheckoutAddressLine = (address = {}) =>
  [address.house_building, address.area_street, address.landmark, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(", ");

const Checkout = () => {
  const { cart, getSubtotal, clearCart } = useCart();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const subtotal = getSubtotal();
  const isProductCodAllowed = cart.every(item => Array.isArray(item.payment_options) && item.payment_options.includes("cod"));
  const isCodAllowed = isProductCodAllowed && subtotal <= COD_MAX_AMOUNT;
  const [activePayment, setActivePayment] = useState("online");
  const [loading, setLoading] = useState(false);
  const [shippingCharge, setShippingCharge] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState("details");
  const [addressForm, setAddressForm] = useState(getEmptyCheckoutAddress(user));
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const rootRef = useRef(null);

  const [formData, setFormData] = useState({
    fullName: user?.name || "",
    email: user?.email || "",
    address: "",
    city: "",
    pincode: "",
    phone: user?.phone || "",
  });

  const shippingDiscountReason = isFirstOrder ? "first_order" : subtotal > FREE_SHIPPING_MIN_AMOUNT ? "minimum_order" : null;
  const shippingDiscount = shippingDiscountReason ? shippingCharge : 0;
  const finalShippingCharge = Math.max(0, shippingCharge - shippingDiscount);
  const returnDeliveryDeduction = shippingDiscountReason === "first_order" ? 0 : shippingCharge;
  const returnRtoDeduction = shippingDiscountReason === "first_order" ? 0 : shippingCharge;
  const paymentFee = activePayment === "cod" ? COD_FEE_AMOUNT : 0;
  const prepaidDiscount = activePayment === "online" ? Math.min(PREPAID_DISCOUNT_AMOUNT, subtotal + finalShippingCharge) : 0;
  const orderGrossTotal = Math.max(0, subtotal + finalShippingCharge + paymentFee - prepaidDiscount);
  const effectiveCouponDiscount = Math.min(couponDiscount, orderGrossTotal);
  const grossAfterCoupon = Math.max(0, orderGrossTotal - effectiveCouponDiscount);
  const walletUsableAmount = useWallet ? Math.min(Number(walletBalance || 0), grossAfterCoupon) : 0;
  const total = Math.max(0, grossAfterCoupon - walletUsableAmount);
  const totalWeightKg = cart.reduce((sum, item) => {
    const rawWeight = Number(item.weight);
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      return sum + (0.5 * Number(item.quantity || 1));
    }
    const weightKg = rawWeight > 5 ? rawWeight / 1000 : rawWeight;
    const qty = Math.max(1, Number(item.quantity || 1));
    return sum + (weightKg * qty) + (PACKAGING_WEIGHT_KG * qty);
  }, 0);

  useEffect(() => {
    let cancelled = false;
    const loadOrderState = async () => {
      if (!user?.id) return;
      try {
        const [ordersRes, addressRes, walletRes, couponRes] = await Promise.all([
          api.get("/api/orders/my"),
          api.get("/api/addresses").catch(() => ({ data: [] })),
          api.get("/api/wallet").catch(() => ({ data: { wallet_balance: 0 } })),
          api.get(API_ENDPOINTS.coupons).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setIsFirstOrder(!Array.isArray(ordersRes.data) || ordersRes.data.length === 0);
        const nextAddresses = Array.isArray(addressRes.data) ? addressRes.data.map(cleanCheckoutAddress) : [];
        setAddresses(nextAddresses);
        const defaultAddress = nextAddresses.find((address) => address.is_default) || nextAddresses[0];
        if (defaultAddress) {
          setSelectedAddressId(String(defaultAddress.id));
          setFormData((current) => ({
            ...current,
            fullName: defaultAddress.name || user?.name || current.fullName,
            email: user?.email || current.email,
            address: getCheckoutAddressLine(defaultAddress),
            city: defaultAddress.city || current.city,
            pincode: String(defaultAddress.pincode || current.pincode || ""),
            phone: defaultAddress.phone || user?.phone || current.phone,
          }));
        }
        setWalletBalance(Number(walletRes.data?.wallet_balance || walletRes.data?.balance || 0));
        setAvailableCoupons(Array.isArray(couponRes.data) ? couponRes.data.filter((coupon) => coupon.is_active !== false) : []);
      } catch {
        if (!cancelled) setIsFirstOrder(false);
      }
    };
    loadOrderState();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (activePayment === "cod" && !isCodAllowed) {
      setActivePayment("online");
    }
  }, [activePayment, isCodAllowed]);

  const selectAddress = (address) => {
    setSelectedAddressId(String(address.id));
    setFormData((current) => ({
      ...current,
      fullName: address.name || user?.name || current.fullName,
      email: user?.email || current.email,
      address: getCheckoutAddressLine(address),
      city: address.city || current.city,
      pincode: String(address.pincode || current.pincode || ""),
      phone: address.phone || user?.phone || current.phone,
    }));
  };

  const resetAddressForm = () => {
    setEditingAddressId(null);
    setAddressForm(getEmptyCheckoutAddress(user));
  };

  const openAddressModal = (address = null) => {
    if (address) {
      setEditingAddressId(address.id);
      setAddressForm(cleanCheckoutAddress(address));
    } else {
      resetAddressForm();
    }
    setShowAddressForm(true);
    setAddressModalOpen(true);
  };

  const closeAddressModal = () => {
    setAddressModalOpen(false);
    setShowAddressForm(false);
    setMapOpen(false);
    resetAddressForm();
  };

  const handleAddressFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setAddressForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : name === "pincode" ? value.replace(/\D/g, "").slice(0, 6) : value,
    }));
  };

  const confirmMapLocation = (location) => {
    setAddressForm((current) => ({
      ...current,
      country: location.country || current.country || "India",
      house_building: location.house_building || current.house_building,
      area_street: location.area_street || current.area_street,
      city: location.city || current.city,
      state: location.state || current.state,
      pincode: location.pincode || current.pincode,
      map_address: location.displayName || current.map_address,
      map_lat: location.center?.[1] || current.map_lat,
      map_lng: location.center?.[0] || current.map_lng,
    }));
    setMapOpen(false);
  };

  const saveCheckoutAddress = async () => {
    const form = cleanCheckoutAddress(addressForm);
    if (!form.house_building || !form.city || !form.state || !/^\d{6}$/.test(form.pincode) || !form.phone) {
      showNotification("Please fill complete delivery address.", "warning");
      return;
    }

    try {
      setAddressSaving(true);
      const payload = {
        ...form,
        name: form.name || user?.name || "",
        phone: form.phone || user?.phone || "",
      };
      const response = editingAddressId
        ? await api.put(`/api/addresses/${editingAddressId}`, payload)
        : await api.post("/api/addresses", payload);
      const saved = cleanCheckoutAddress(response.data);
      const addressRes = await api.get("/api/addresses");
      const nextAddresses = Array.isArray(addressRes.data) ? addressRes.data.map(cleanCheckoutAddress) : [saved];
      setAddresses(nextAddresses);
      setSelectedAddressId(String(saved.id));
      selectAddress(saved);
      closeAddressModal();
      showNotification("Address saved.", "success");
    } catch (error) {
      showNotification(error?.response?.data?.message || "Unable to save address.", "warning");
    } finally {
      setAddressSaving(false);
    }
  };

  const applyCheckoutCoupon = (couponOrCode = couponCode) => {
    const coupon = typeof couponOrCode === "object"
      ? couponOrCode
      : availableCoupons.find((item) => String(item.code).toUpperCase() === String(couponOrCode).trim().toUpperCase());
    if (!coupon) {
      showNotification("Coupon not found.", "warning");
      return;
    }
    if (subtotal < Number(coupon.min_purchase_amount || 0)) {
      showNotification(`Add Rs. ${(Number(coupon.min_purchase_amount || 0) - subtotal).toLocaleString("en-IN")} more to use this coupon.`, "warning");
      return;
    }
    const rawDiscount = coupon.discount_type === "percentage"
      ? subtotal * (Number(coupon.discount_percent || 0) / 100)
      : Number(coupon.discount_amount || 0);
    const nextDiscount = Math.min(rawDiscount, Number(coupon.max_discount_amount || rawDiscount), subtotal);
    setAppliedCoupon({ ...coupon, discount: nextDiscount });
    setCouponDiscount(nextDiscount);
    setCouponCode(coupon.code);
    showNotification(`Coupon ${coupon.code} applied.`, "success");
  };

  const removeCheckoutCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponCode("");
  };

  const proceedToReview = () => {
    const { isValid, errors } = validateCheckoutForm(formData);
    if (!isValid) {
      showNotification(`Please fix: ${Object.values(errors).join(" | ")}`, "warning");
      return;
    }
    if (activePayment === "cod" && !isCodAllowed) {
      showNotification(`COD is available only up to Rs. ${COD_MAX_AMOUNT.toLocaleString("en-IN")} and only for COD-enabled products.`, "warning");
      return;
    }
    setCheckoutStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      if (activePayment === "cod" && !isCodAllowed) {
        showNotification(`COD is available only up to Rs. ${COD_MAX_AMOUNT.toLocaleString("en-IN")} and only for COD-enabled products.`, "warning");
        setLoading(false);
        return;
      }

      const finalOrderData = {
        customer_name: formData.fullName,
        customer_email: formData.email,
        address: formData.address,
        city: formData.city,
        pincode: formData.pincode,
        phone: formData.phone,
        subtotal_amount: subtotal,
        shipping_charge: shippingCharge,
        shipping_discount: shippingDiscount,
        shipping_discount_reason: shippingDiscountReason,
        total_amount: orderGrossTotal,
        coupon_code: appliedCoupon?.code || null,
        discount_amount: effectiveCouponDiscount,
        wallet_amount: walletUsableAmount,
        payment_fee: paymentFee,
        payment_discount: prepaidDiscount,
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
        try {
          const dbRes = await api.post("/api/orders", finalOrderData);
          clearCart();
          navigate(`/order-confirmation?orderId=${dbRes.data.orderId}`);
        } catch (error) {
          showNotification(error?.response?.data?.message || "Failed to place COD order.", "error");
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
              try {
                const dbRes = await api.post("/api/orders", finalOrderData);
                clearCart();
                navigate(`/order-confirmation?orderId=${dbRes.data.orderId}`);
              } catch (error) {
                showNotification(error?.response?.data?.message || "Unable to save paid order.", "error");
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
      <main className="flex-grow py-5 lg:py-8">
        <div className="checkout-page-shell w-full px-4 lg:px-12">
          <button
            type="button"
            onClick={() => (checkoutStep === "review" ? setCheckoutStep("details") : navigate("/cart"))}
            className="checkout-back-btn checkout-back-inline"
            aria-label={checkoutStep === "review" ? "Back to delivery details" : "Back to bag"}
          >
            <Icon icon="lucide:arrow-left" />
            <span>{checkoutStep === "review" ? "Back" : "Bag"}</span>
          </button>
          <div className="checkout-layout grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="checkout-flow lg:col-span-8 space-y-12">
              {checkoutStep === "details" && (
              <>
              <section className="buy-now-section checkout-section">
                <div className="buy-now-section-title">
                  <h3>Delivery address</h3>
                  <button type="button" onClick={() => openAddressModal()}>
                    <Icon icon="lucide:plus" />
                    Add new
                  </button>
                </div>

                {addresses.length > 0 ? (
                  <div className="buy-now-address-list checkout-address-list">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={`buy-now-address ${String(selectedAddressId) === String(address.id) ? "active" : ""}`}
                      >
                        <input
                          type="radio"
                          checked={String(selectedAddressId) === String(address.id)}
                          onChange={() => selectAddress(address)}
                        />
                        <span>
                          <strong>{address.label || "Saved Address"} {address.is_default && <em>Default</em>}</strong>
                          <small>{getCheckoutAddressLine(address)}</small>
                          <small>{address.name || user?.name} · {address.phone || user?.phone}</small>
                        </span>
                        <button type="button" onClick={(event) => {
                          event.preventDefault();
                          openAddressModal(address);
                        }}>
                          Edit
                        </button>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="checkout-no-address">
                    <Icon icon="lucide:map-pin-plus" />
                    <div>
                      <strong>No saved address</strong>
                      <span>Add a delivery address to continue.</span>
                    </div>
                    <button type="button" onClick={() => openAddressModal()}>Add address</button>
                  </div>
                )}
              </section>

              <section className="buy-now-section checkout-section">
                <div className="buy-now-section-title">
                  <h3>Payment</h3>
                </div>
                <div className="buy-now-payment-grid">
                  <button
                    type="button"
                    className={activePayment === "online" ? "active" : ""}
                    onClick={() => setActivePayment("online")}
                  >
                    <Icon icon="lucide:shield-check" />
                    <span>Online Payment</span>
                    <small>Pay securely using Razorpay. Rs. {PREPAID_DISCOUNT_AMOUNT.toLocaleString("en-IN")} extra off</small>
                  </button>

                  <button
                    type="button"
                    disabled={!isCodAllowed}
                    className={activePayment === "cod" ? "active" : ""}
                    onClick={() => {
                      if (isCodAllowed) {
                        setActivePayment("cod");
                      } else if (subtotal > COD_MAX_AMOUNT) {
                        showNotification(`COD is available only up to Rs. ${COD_MAX_AMOUNT.toLocaleString("en-IN")}.`, "warning");
                      } else {
                        showNotification("Some products in your cart do not support Cash on Delivery.", "warning");
                      }
                    }}
                  >
                    <Icon icon="lucide:banknote" />
                    <span>Cash on Delivery</span>
                    <small>{isCodAllowed ? `Rs. ${COD_FEE_AMOUNT.toLocaleString("en-IN")} COD charge` : subtotal > COD_MAX_AMOUNT ? `Not available above Rs. ${COD_MAX_AMOUNT.toLocaleString("en-IN")}` : "Unavailable for some items"}</small>
                  </button>
                </div>
              </section>
              </>
              )}

              {checkoutStep === "review" && (
              <section className="buy-now-section checkout-section">
                <div className="buy-now-section-title">
                  <h3>Coupons & wallet</h3>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-[#3D2817]/60 uppercase tracking-widest mb-2">Coupon code</label>
                    <div className="flex gap-3">
                      <input
                        value={couponCode}
                        onChange={(event) => setCouponCode(event.target.value)}
                        placeholder="Enter coupon"
                        className="flex-1 bg-[#F5F1E8]/50 border border-[#D4AF37]/30 rounded-lg px-4 py-3 focus:outline-none focus:border-[#800020]"
                      />
                      {appliedCoupon ? (
                        <button type="button" onClick={removeCheckoutCoupon} className="px-5 rounded-lg border border-red-200 text-red-700 font-semibold text-sm">
                          Remove
                        </button>
                      ) : (
                        <button type="button" onClick={() => applyCheckoutCoupon()} className="px-5 rounded-lg bg-[#800020] text-[#D4AF37] font-semibold text-sm">
                          Apply
                        </button>
                      )}
                    </div>
                  </div>

                  {availableCoupons.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {availableCoupons.slice(0, 4).map((coupon) => (
                        <button
                          key={coupon.id || coupon.code}
                          type="button"
                          onClick={() => applyCheckoutCoupon(coupon)}
                          className="rounded-xl border border-[#D4AF37]/20 bg-[#F5F1E8]/30 p-4 text-left hover:border-[#800020]/50 transition-colors"
                        >
                          <span className="block text-sm font-bold text-[#800020] uppercase tracking-widest">{coupon.code}</span>
                          <span className="mt-1 block text-xs text-[#6f594d]">
                            {coupon.discount_type === "percentage" ? `${Number(coupon.discount_percent || 0)}% off` : `Rs. ${Number(coupon.discount_amount || 0).toLocaleString("en-IN")} off`}
                            {coupon.min_purchase_amount ? ` on Rs. ${Number(coupon.min_purchase_amount).toLocaleString("en-IN")}+` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="flex items-center justify-between gap-4 rounded-xl border border-[#D4AF37]/20 bg-[#F5F1E8]/30 p-4">
                    <span>
                      <span className="block text-sm font-semibold text-[#3D2817]">Use wallet money</span>
                      <span className="block text-xs text-[#6f594d]">Available Rs. {Number(walletBalance || 0).toLocaleString("en-IN")}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={useWallet}
                      disabled={Number(walletBalance || 0) <= 0}
                      onChange={(event) => setUseWallet(event.target.checked)}
                      className="h-5 w-5 accent-[#800020]"
                    />
                  </label>
                </div>
              </section>
              )}
            </div>

            <div className="lg:col-span-4">
              <div className="summary-card sticky top-28">
                <div className="checkout-summary-card bg-white rounded-2xl p-8 shadow-xl border border-[#D4AF37]/20">
                  <h3 className="text-xl font-bold text-[#3D2817] mb-8 uppercase tracking-widest border-b border-[#D4AF37]/10 pb-4 brand-font">Order Summary</h3>
                  <div className="space-y-6 mb-8">
                    {cart.map((item) => {
                      const productName = item.name;

                      return (
                      <div key={`${item.id}-${item.colorId}`} className="flex items-center space-x-4">
                        <Link to={`/product/${item.slug}`} className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-[#F5F1E8]" aria-label={`Open ${productName}`}><img src={item.image_url} className="w-full h-full object-cover" alt={productName} /></Link>
                        <div className="flex-grow">
                          <Link to={`/product/${item.slug}`} className="checkout-summary-product-link">
                            <h4 className="text-xs font-bold text-[#3D2817] tracking-wider">{productName}</h4>
                          </Link>
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
                        <span>-Rs. {effectiveCouponDiscount.toLocaleString("en-IN")}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 uppercase tracking-widest font-bold">Shipping</span>
                      <span className={`font-bold ${shippingCharge > 0 ? "text-[#3D2817]" : "text-green-600"}`}>
                        {shippingLoading
                          ? "CALCULATING..."
                          : shippingCharge > 0
                            ? `Rs. ${shippingCharge.toLocaleString("en-IN")}`
                            : "FREE DELIVERY"}
                      </span>
                    </div>
                    {prepaidDiscount > 0 && (
                      <div className="flex justify-between items-center text-xs text-emerald-600 font-bold">
                        <span>PREPAID DISCOUNT</span>
                        <span>-Rs. {prepaidDiscount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {paymentFee > 0 && (
                      <div className="flex justify-between items-center text-xs text-[#800020] font-bold">
                        <span>COD FEE</span>
                        <span>Rs. {paymentFee.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {shippingDiscount > 0 && (
                      <div className="flex justify-between items-center text-xs text-emerald-600 font-bold">
                        <span>{shippingDiscountReason === "first_order" ? "FIRST ORDER FREE SHIPPING" : "FREE SHIPPING ABOVE RS. 10,000"}</span>
                        <span>-Rs. {shippingDiscount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {walletUsableAmount > 0 && (
                      <div className="flex justify-between items-center text-xs text-emerald-600 font-bold">
                        <span>WALLET USED</span>
                        <span>-Rs. {walletUsableAmount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {shippingCharge > 0 && (
                      <div className="rounded-lg border border-[#D4AF37]/20 bg-[#FFF7E8] p-3 text-xs leading-relaxed text-[#6f594d]">
                        {shippingDiscountReason === "first_order"
                          ? "Return on first-order free shipping: delivery and RTO will not be deducted. Exchange has no logistics deduction."
                          : `Return refund may deduct Rs. ${returnDeliveryDeduction.toLocaleString("en-IN")} delivery + Rs. ${returnRtoDeduction.toLocaleString("en-IN")} RTO. Exchange has no logistics deduction.`}
                      </div>
                    )}
                  </div>

                  <div className="mt-10 pt-6 border-t-2 border-[#D4AF37]/20">
                    <div className="flex justify-between items-center mb-8">
                      <span className="text-sm font-bold text-[#3D2817] uppercase tracking-[0.2em]">Total Payable</span>
                      <span className="text-2xl font-bold text-[#800020]">Rs. {total.toLocaleString("en-IN")}</span>
                    </div>
                    
                    <div className="flex flex-col items-end mb-6">
                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Inclusive of all taxes</p>
                    </div>

                    {checkoutStep === "details" ? (
                      <button onClick={proceedToReview} disabled={shippingLoading} className="checkout-primary-btn w-full">
                        {shippingLoading ? "Checking delivery..." : "Continue"}
                      </button>
                    ) : (
                      <button onClick={handlePlaceOrder} disabled={loading} className="checkout-primary-btn w-full">
                        {loading ? "Processing..." : activePayment === "cod" ? "Place COD Order" : "Pay & Place Order"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {addressModalOpen && (
        <div className="buy-now-address-modal" role="dialog" aria-modal="true" aria-label={editingAddressId ? "Edit address" : "Add new address"}>
          <div className="buy-now-address-modal-card">
            <button type="button" className="buy-now-address-modal-close" onClick={closeAddressModal} aria-label="Close address form">
              <Icon icon="lucide:x" />
            </button>
            <div className="buy-now-section-title buy-now-address-modal-title">
              <h3>{editingAddressId ? "Edit address" : "Add new address"}</h3>
              <span>Required fields are marked with *.</span>
            </div>

            <div className="buy-now-location-card">
              <div>
                <span>Map address</span>
                {addressForm.map_address ? (
                  <>
                    <strong>{addressForm.map_address}</strong>
                    <small>Saved separately from the address you type below.</small>
                  </>
                ) : (
                  <small>Add live location for better delivery accuracy.</small>
                )}
              </div>
              <div className="buy-now-location-actions">
                <button type="button" onClick={() => setMapOpen(true)}>
                  <Icon icon="lucide:map-pin" />
                  {addressForm.map_address ? "Change map location" : "Add map location"}
                </button>
                {addressForm.map_address ? (
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => setAddressForm((current) => ({ ...current, map_address: "", map_lat: "", map_lng: "" }))}
                  >
                    <Icon icon="lucide:x" />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>

            {showAddressForm && (
              <div className="buy-now-address-form">
                <div className="buy-now-form-row">
                  <label>
                    <span>Label</span>
                    <select name="label" value={addressForm.label} onChange={handleAddressFormChange}>
                      <option>Home</option>
                      <option>Work</option>
                      <option>Other</option>
                    </select>
                  </label>
                  <label>
                    <span>Receiver name</span>
                    <input name="name" value={addressForm.name} onChange={handleAddressFormChange} />
                  </label>
                </div>
                <label>
                  <span>Flat, House no., Building *</span>
                  <input name="house_building" value={addressForm.house_building} onChange={handleAddressFormChange} />
                </label>
                <label>
                  <span>Area, Street, Sector</span>
                  <input name="area_street" value={addressForm.area_street} onChange={handleAddressFormChange} />
                </label>
                <div className="buy-now-form-row">
                  <label>
                    <span>City *</span>
                    <input name="city" value={addressForm.city} onChange={handleAddressFormChange} />
                  </label>
                  <label>
                    <span>State *</span>
                    <input name="state" value={addressForm.state} onChange={handleAddressFormChange} />
                  </label>
                </div>
                <div className="buy-now-form-row">
                  <label>
                    <span>Pincode *</span>
                    <input name="pincode" inputMode="numeric" value={addressForm.pincode} onChange={handleAddressFormChange} />
                  </label>
                  <label>
                    <span>Phone *</span>
                    <input name="phone" inputMode="tel" value={addressForm.phone} onChange={handleAddressFormChange} />
                  </label>
                </div>
                <label>
                  <span>Landmark</span>
                  <input name="landmark" value={addressForm.landmark} onChange={handleAddressFormChange} />
                </label>
                <label className="buy-now-checkbox">
                  <input type="checkbox" name="is_default" checked={addressForm.is_default} onChange={handleAddressFormChange} />
                  <span>Set as default address</span>
                </label>
                <div className="buy-now-form-actions">
                  <button type="button" onClick={closeAddressModal} disabled={addressSaving}>
                    Cancel
                  </button>
                  <button type="button" onClick={saveCheckoutAddress} disabled={addressSaving}>
                    {addressSaving ? "Saving..." : "Save address"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <LocationPickerModal
        open={mapOpen}
        initialQuery={[addressForm.house_building, addressForm.city, addressForm.state].filter(Boolean).join(", ")}
        onClose={() => setMapOpen(false)}
        onConfirm={confirmMapLocation}
      />
    </div>
  );
};

export default Checkout;
