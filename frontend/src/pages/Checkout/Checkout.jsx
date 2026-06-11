import { Icon } from "@iconify/react";
import { useState, useEffect, useRef } from "react";
import { imgUrl } from "../../utils/cloudinary";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import { API_ENDPOINTS } from "../../config/api";
import api from "../../utils/api";
import { validateCheckoutForm } from "../../utils/validation";
import { unwrapApiData } from "../../utils/error";
import { LocationPickerModal } from "../Profile/Profile";
import CheckoutOrderPanel from "../../components/CheckoutOrderPanel";
import { getProductStockInfo } from "../../utils/stockStatus";
import { formatEstimatedDeliveryDate, getEstimatedDeliveryDate } from "../../utils/deliveryDate";
import { getVariantSku } from "../../utils/itemCode";
import { selectBestCourier } from "../../utils/courierSelection";
import { numberEnv, requiredEnv } from "../../utils/env";
import { buildRazorpayPrefill } from "../../utils/razorpay";
import "./Checkout.css";

const PACKAGING_WEIGHT_KG = numberEnv("VITE_PACKAGING_WEIGHT_KG");
const COD_MAX_AMOUNT = numberEnv("VITE_COD_MAX_AMOUNT");
const PREPAID_DISCOUNT_AMOUNT = numberEnv("VITE_PREPAID_DISCOUNT_AMOUNT");
const COD_FEE_AMOUNT = numberEnv("VITE_COD_FEE_AMOUNT");
const PLATFORM_FEE_AMOUNT = numberEnv("VITE_PLATFORM_FEE_AMOUNT");
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

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const Checkout = () => {
  const { cart, clearCart, appliedCoupon, discountAmount, applyCoupon: cartApplyCoupon, removeCoupon: cartRemoveCoupon } = useCart();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const checkoutCart = cart.map((item) => {
    const stockInfo = getProductStockInfo(item, item.colorId);
    const isUnavailable = stockInfo.isOutOfStock || Number(item.quantity || 1) > stockInfo.quantity;
    return { ...item, checkoutUnavailable: isUnavailable, checkoutStockInfo: stockInfo };
  });
  const payableCart = checkoutCart.filter((item) => !item.checkoutUnavailable);
  const unavailableCart = checkoutCart.filter((item) => item.checkoutUnavailable);
  const subtotal = payableCart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  const isProductCodAllowed = payableCart.length > 0 && payableCart.every(item => Array.isArray(item.payment_options) && item.payment_options.includes("cod"));
  const isCodAllowed = isProductCodAllowed && subtotal <= COD_MAX_AMOUNT;
  const [activePayment, setActivePayment] = useState("online");
  const [loading, setLoading] = useState(false);
  const [paymentVerifying, setPaymentVerifying] = useState(false);
  const [shippingCharge, setShippingCharge] = useState(0);
  const [shippingDeliveryDate, setShippingDeliveryDate] = useState(null);
  const [selectedShippingCourier, setSelectedShippingCourier] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addressLoading, setAddressLoading] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [couponCode, setCouponCode] = useState(appliedCoupon?.code || "");
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [couponPanelOpen, setCouponPanelOpen] = useState(false);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponCelebration, setCouponCelebration] = useState(null);
  const [checkoutStep, setCheckoutStep] = useState("details");
  const [addressForm, setAddressForm] = useState(getEmptyCheckoutAddress(user));
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState(null);
  const [addrFormErrors, setAddrFormErrors] = useState({});
  const rootRef = useRef(null);
  const orderingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const [formData, setFormData] = useState({
    fullName: user?.name || "",
    email: user?.email || "",
    address: "",
    city: "",
    pincode: "",
    phone: user?.phone || "",
  });

  const shippingDiscountReason = shippingCharge > 0 ? (isFirstOrder ? "first_order" : "free_delivery") : null;
  const shippingDiscount = shippingDiscountReason ? shippingCharge : 0;
  const finalShippingCharge = Math.max(0, shippingCharge - shippingDiscount);
  const returnDeliveryDeduction = shippingDiscountReason === "first_order" ? 0 : shippingCharge;
  const paymentFee = payableCart.length > 0 && activePayment === "cod" ? COD_FEE_AMOUNT : 0;
  const platformFee = payableCart.length > 0 ? PLATFORM_FEE_AMOUNT : 0;
  const paymentDiscount = payableCart.length > 0 && activePayment === "online" ? Math.min(PREPAID_DISCOUNT_AMOUNT, subtotal + finalShippingCharge) : 0;
  const orderGrossTotal = Math.max(0, subtotal + finalShippingCharge + paymentFee + platformFee - paymentDiscount);
  const effectiveCouponDiscount = Math.min(discountAmount, orderGrossTotal);
  const grossAfterCoupon = Math.max(0, orderGrossTotal - effectiveCouponDiscount);
  const walletUsableAmount = useWallet ? Math.min(Number(walletBalance || 0), grossAfterCoupon) : 0;
  const total = Math.max(0, grossAfterCoupon - walletUsableAmount);
  const totalWeightKg = payableCart.reduce((sum, item) => {
    const qty = Math.max(1, Number(item.quantity || 1));
    const raw = Number(item.weight || 0);
    const productWeightKg = raw > 5 ? raw / 1000 : raw;
    return sum + ((productWeightKg + PACKAGING_WEIGHT_KG) * qty);
  }, 0);

  const getCouponSavingsText = (coupon) => {
    if (!coupon) return "Coupons & offers";
    const code = String(coupon.code || "").toUpperCase();
    if (coupon.discount_type === "percentage") return `Save ${Number(coupon.discount_percent || 0)}% with ${code}`;
    return `Save Rs. ${Number(coupon.discount_amount || 0).toLocaleString("en-IN")} with ${code}`;
  };

  const getCouponSubtext = (coupon) => {
    if (!coupon) return "Choose an offer for this order.";
    const minAmount = Number(coupon.min_purchase_amount || 0);
    if (minAmount > subtotal) return `Shop for Rs. ${(minAmount - subtotal).toLocaleString("en-IN")} more to apply`;
    return coupon.description || "Tap to apply this offer at checkout.";
  };

  useEffect(() => {
    let cancelled = false;
    const loadOrderState = async () => {
      if (!user?.id) {
        setAddressLoading(false);
        return;
      }
      try {
        const [ordersRes, addressRes, walletRes, couponRes] = await Promise.all([
          api.get("/api/orders/my"),
          api.get("/api/addresses").catch(() => ({ data: [] })),
          api.get("/api/wallet").catch(() => ({ data: { wallet_balance: 0 } })),
          api.get(API_ENDPOINTS.coupons).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const ordersData = unwrapApiData(ordersRes.data);
        const ordersList = Array.isArray(ordersData) ? ordersData : [];
        setIsFirstOrder(ordersList.length === 0);
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
      } finally {
        if (!cancelled) setAddressLoading(false);
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
    setAddrFormErrors({});
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
    if (addrFormErrors[name]) setAddrFormErrors((prev) => ({ ...prev, [name]: undefined }));
    setAddressForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked
        : name === "pincode" ? value.replace(/\D/g, "").slice(0, 6)
        : name === "phone" ? value.replace(/\D/g, "").slice(0, 10)
        : value,
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

  const deleteCheckoutAddress = async (address) => {
    try {
      setDeletingAddressId(String(address.id));
      await api.delete(`/api/addresses/${address.id}`);
      const nextAddresses = addresses.filter((a) => String(a.id) !== String(address.id));
      setAddresses(nextAddresses);
      if (String(selectedAddressId) === String(address.id)) {
        const next = nextAddresses.find((a) => a.is_default) || nextAddresses[0];
        if (next) {
          selectAddress(next);
        } else {
          setSelectedAddressId("");
        }
      }
      showNotification("Address deleted.", "success");
    } catch (error) {
      showNotification(error?.response?.data?.message || "Unable to delete address.", "warning");
    } finally {
      setDeletingAddressId(null);
    }
  };

  const saveCheckoutAddress = async () => {
    const form = cleanCheckoutAddress(addressForm);
    const phone = normalizePhone(form.phone);
    const errors = {};
    if (!form.house_building.trim()) errors.house_building = "Address is required.";
    if (!form.city.trim()) errors.city = "City is required.";
    if (!form.state.trim()) errors.state = "State is required.";
    if (!form.pincode || !/^\d{6}$/.test(form.pincode)) errors.pincode = "Enter a valid 6-digit pincode.";
    if (!phone) errors.phone = "Phone is required.";
    else if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = "Enter a valid 10-digit mobile number.";
    if (Object.keys(errors).length > 0) {
      setAddrFormErrors(errors);
      return;
    }
    setAddrFormErrors({});

    try {
      setAddressSaving(true);
      const payload = {
        ...form,
        name: form.name || user?.name || "",
        phone: phone || user?.phone || "",
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
    const rawDiscount = coupon.discount_type === "percentage"
      ? subtotal * (Number(coupon.discount_percent || 0) / 100)
      : Number(coupon.discount_amount || 0);
    const nextDiscount = Math.min(rawDiscount, Number(coupon.max_discount_amount || rawDiscount), subtotal);
    const applied = cartApplyCoupon(coupon);
    if (applied) {
      setCouponCode(coupon.code);
      setCouponPanelOpen(false);
      setCouponModalOpen(false);
      setCouponCelebration({ code: coupon.code, discount: nextDiscount });
    }
  };

  const removeCheckoutCoupon = () => {
    cartRemoveCoupon();
    setCouponCode("");
    setCouponCelebration(null);
  };

  const proceedToReview = () => {
    if (payableCart.length === 0) {
      showNotification("All items in your cart are unavailable right now.", "warning");
      return;
    }
    const { isValid, errors } = validateCheckoutForm(formData);
    if (!isValid) {
      showNotification(`Please fix: ${Object.values(errors).join(" | ")}`, "warning");
      return;
    }
    if (activePayment === "cod" && !isCodAllowed) {
      showNotification(`COD is available only up to Rs. ${COD_MAX_AMOUNT.toLocaleString("en-IN")}.`, "warning");
      return;
    }
    setCheckoutStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (cart.length === 0 && !orderingRef.current) {
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

  useEffect(() => {
    if (!couponCelebration) return undefined;
    const timer = setTimeout(() => setCouponCelebration(null), 2400);
    return () => clearTimeout(timer);
  }, [couponCelebration]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const cleanPincode = formData.pincode.trim();
    if (!/^\d{6}$/.test(cleanPincode) || payableCart.length === 0) {
      setShippingCharge(0);
      setShippingDeliveryDate(null);
      setSelectedShippingCourier(null);
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
        const selectedCourier = selectBestCourier(couriers, {
          weightKg: effectiveWeight,
          requireCod: activePayment === "cod" && subtotal <= COD_MAX_AMOUNT,
        });

        console.log("Serviceability check - selected courier:", selectedCourier);

        if (!cancelled) {
          setShippingCharge(selectedCourier?.rate || 0);
          setShippingDeliveryDate(selectedCourier?.etd ? formatEstimatedDeliveryDate(getEstimatedDeliveryDate(selectedCourier.etd)) : null);
          setSelectedShippingCourier(selectedCourier || null);
        }
      } catch (error) {
        if (!cancelled) {
          setShippingCharge(0);
          setShippingDeliveryDate(null);
          setSelectedShippingCourier(null);
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
  }, [formData.pincode, payableCart.length, totalWeightKg, activePayment, subtotal]);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    const { isValid, errors } = validateCheckoutForm(formData);
    if (!isValid) {
      showNotification(`Please fix: ${Object.values(errors).join(" | ")}`, "warning");
      return;
    }

    setLoading(true);
    try {
      if (payableCart.length === 0) {
        showNotification("All items in your cart are unavailable right now.", "warning");
        setLoading(false);
        return;
      }
      if (activePayment === "cod" && !isCodAllowed) {
        showNotification(`COD is available only up to Rs. ${COD_MAX_AMOUNT.toLocaleString("en-IN")}.`, "warning");
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
        selected_courier_data: selectedShippingCourier?.raw || null,
        total_amount: orderGrossTotal,
        coupon_code: appliedCoupon?.code || null,
        discount_amount: effectiveCouponDiscount,
        wallet_amount: walletUsableAmount,
        payment_fee: paymentFee + platformFee,
        payment_discount: paymentDiscount,
        payment_method: activePayment === 'cod' ? 'COD' : 'Prepaid',
        payment_status: activePayment === 'cod' ? 'Pending' : 'Paid',
        items: payableCart.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          colorId: item.colorId,
        })),
      };

      if (activePayment === "cod" || total <= 0) {
        const dbRes = await api.post("/api/orders", finalOrderData);
        orderingRef.current = true;
        clearCart();
        navigate(`/order-confirmation?orderId=${dbRes.data.orderId}`);
        return;
      }

      if (!window.Razorpay) {
        throw new Error("Payment gateway is still loading. Please try again.");
      }

      const orderResponse = await api.post(API_ENDPOINTS.razorpay.createOrder, {
        subtotal_amount: subtotal,
        discount_amount: effectiveCouponDiscount,
        wallet_amount: walletUsableAmount,
      });
      const razorpayOrder = orderResponse.data;
      if (!orderResponse.status || orderResponse.status >= 400) throw new Error(razorpayOrder.message || "Unable to start payment.");

      const razorpay = new window.Razorpay({
        key: requiredEnv("VITE_RAZORPAY_KEY_ID"),
        amount: razorpayOrder.amount,
        currency: "INR",
        name: "Banarasi Kala",
        description: "Banarasi Kala order",
        order_id: razorpayOrder.id,
        prefill: buildRazorpayPrefill({
          name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
        }),
        theme: { color: "#800020" },
        handler: async (response) => {
          setPaymentVerifying(true);

          const onBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = "";
          };
          window.addEventListener("beforeunload", onBeforeUnload);

          try {
            const verifyRes = await api.post(API_ENDPOINTS.razorpay.verifyPayment, response);
            const verifyData = verifyRes.data;
            if (!verifyData.success) throw new Error(verifyData.message || "Payment verification failed.");

            const dbRes = await api.post("/api/orders", {
              ...finalOrderData,
              payment_gateway: "razorpay",
              gateway_order_id: response.razorpay_order_id,
              gateway_payment_id: response.razorpay_payment_id,
              gateway_signature: response.razorpay_signature,
              gateway_amount_paise: razorpayOrder.amount,
              gateway_currency: razorpayOrder.currency || "INR",
              payment_gateway_response: {
                provider: "razorpay",
                order: razorpayOrder,
                payment: response,
                verification: verifyData,
              },
            });
            orderingRef.current = true;
            clearCart();
            navigate(`/order-confirmation?orderId=${dbRes.data.orderId}`);
          } catch (error) {
            if (isMountedRef.current) {
              setPaymentVerifying(false);
              showNotification(error.message || "Unable to save paid order.", "error");
            }
          } finally {
            window.removeEventListener("beforeunload", onBeforeUnload);
            if (isMountedRef.current) setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });
      razorpay.open();
    } catch (err) {
      console.error(err);
      showNotification(err?.response?.data?.message || "We could not place your order. Please try again.", "error");
      setLoading(false);
    } finally {
      if (activePayment === "cod" || total <= 0) setLoading(false);
    }
  };

  return (
    <div className="checkout-page relative min-h-screen flex flex-col bg-[#F5F1E8]" ref={rootRef}>
      <main className="flex-grow py-5 lg:py-8">
        <div className="checkout-page-shell w-full px-4 lg:px-12">
          <div className="checkout-modal-card">
            <div className="checkout-modal-header">
              <div>
                <span>Checkout</span>
                <h2>Complete your order</h2>
              </div>
              <button type="button" onClick={() => navigate("/cart")} aria-label="Close checkout">
                <Icon icon="lucide:x" />
              </button>
            </div>
          <div className="checkout-layout">
            <CheckoutOrderPanel
              step={checkoutStep}
              addresses={addresses}
              selectedAddressId={selectedAddressId}
              onSelectAddress={selectAddress}
              addressLoading={addressLoading}
              onAddAddress={() => openAddressModal()}
              onEditAddress={openAddressModal}
              onDeleteAddress={deleteCheckoutAddress}
              deletingAddressId={deletingAddressId}
              getAddressLine={getCheckoutAddressLine}
              user={user}
              paymentOptions={[
                {
                  id: "online",
                  icon: "lucide:shield-check",
                  title: "Online Payment",
                  description: `Rs. ${PREPAID_DISCOUNT_AMOUNT.toLocaleString("en-IN")} extra off`,
                  active: activePayment === "online",
                  onSelect: () => setActivePayment("online"),
                },
                {
                  id: "cod",
                  icon: "lucide:banknote",
                  title: "Cash on Delivery",
                  description: isCodAllowed ? `Rs. ${COD_FEE_AMOUNT.toLocaleString("en-IN")} COD charge` : subtotal > COD_MAX_AMOUNT ? `Not available above Rs. ${COD_MAX_AMOUNT.toLocaleString("en-IN")}` : "Unavailable for some items",
                  active: activePayment === "cod",
                  disabled: !isCodAllowed,
                  onSelect: () => {
                    if (isCodAllowed) {
                      setActivePayment("cod");
                    } else if (subtotal > COD_MAX_AMOUNT) {
                      showNotification(`COD is available only up to Rs. ${COD_MAX_AMOUNT.toLocaleString("en-IN")}.`, "warning");
                    } else {
                      showNotification("Some products in your cart do not support Cash on Delivery.", "warning");
                    }
                  },
                },
              ]}
              reviewItems={checkoutCart.map((item) => ({
                key: `${item.id}-${item.colorId}-review`,
                image: item.image_url,
                name: item.name,
                meta: `Qty ${item.quantity} x Rs. ${Number(item.price).toLocaleString("en-IN")}${getVariantSku(item, item.colorId, item.selectedColorSlug || item.selectedColorName) ? ` - SKU: ${getVariantSku(item, item.colorId, item.selectedColorSlug || item.selectedColorName)}` : ""}`,
                total: item.checkoutUnavailable ? "Excluded" : `Rs. ${(Number(item.price) * Number(item.quantity || 1)).toLocaleString("en-IN")}`,
                unavailable: item.checkoutUnavailable,
                unavailableLabel: item.checkoutStockInfo?.badge || "Unavailable - excluded from total",
              }))}
              reviewAddress={{
                name: formData.fullName,
                line: [formData.address, formData.city, formData.pincode].filter(Boolean).join(", "),
                phone: formData.phone,
              }}
              reviewPayment={{
                title: activePayment === "cod" ? "Cash on Delivery" : "Online Payment",
                description: activePayment === "cod" ? "Pay when your order is delivered." : "Pay securely using Razorpay.",
              }}
              onEditDetails={() => setCheckoutStep("details")}
              summaryProps={{
                title: "Order Summary",
                items: checkoutCart.map((item) => ({
                  key: `${item.id}-${item.colorId}`,
                  href: `/product/${item.slug}`,
                  image: item.image_url,
                  name: item.name,
                  meta: `${item.quantity} x Rs. ${Number(item.price).toLocaleString("en-IN")}`,
                  total: item.checkoutUnavailable ? "Excluded" : `Rs. ${(Number(item.price) * Number(item.quantity || 1)).toLocaleString("en-IN")}`,
                  unavailable: item.checkoutUnavailable,
                  unavailableLabel: item.checkoutStockInfo?.badge || "Unavailable - excluded from total",
                })),
                showOffers: true,
                coupons: availableCoupons,
                appliedCoupon,
                couponDiscount: effectiveCouponDiscount,
                couponCode,
                setCouponCode,
                onApplyCoupon: applyCheckoutCoupon,
                onRemoveCoupon: removeCheckoutCoupon,
                walletBalance,
                useWallet,
                setUseWallet,
                rows: [
                  { label: "Subtotal", value: `Rs. ${subtotal.toLocaleString("en-IN")}` },
                  ...(unavailableCart.length > 0 ? [{ label: "Unavailable items", value: `${unavailableCart.length} excluded`, tone: "accent" }] : []),
                  { label: "Platform fee", value: `Rs. ${platformFee.toLocaleString("en-IN")}` },
                  ...(paymentFee > 0 ? [{ label: "COD charge", value: `Rs. ${paymentFee.toLocaleString("en-IN")}`, tone: "accent" }] : []),
                  { label: "Delivery", value: shippingLoading ? "Calculating..." : shippingCharge > 0 ? <><s>Rs. {shippingCharge.toLocaleString("en-IN")}</s>{" "}Free</> : "Free", tone: shippingLoading ? undefined : "success" },
                  ...(paymentDiscount > 0 ? [{ label: "Prepaid discount", value: `-Rs. ${paymentDiscount.toLocaleString("en-IN")}`, tone: "success" }] : []),
                  ...(appliedCoupon ? [{ label: `Coupon (${appliedCoupon.code})`, value: `-Rs. ${effectiveCouponDiscount.toLocaleString("en-IN")}`, tone: "success" }] : []),
                  ...(walletUsableAmount > 0 ? [{ label: "Wallet used", value: `-Rs. ${walletUsableAmount.toLocaleString("en-IN")}`, tone: "success" }] : []),
                ],
                logistics: null,
                deliveryPromise: shippingDeliveryDate ? {
                  title: `Arriving ${shippingDeliveryDate}`,
                  subtitle: "Free standard delivery",
                  tooltip: "This is an estimated delivery date. It may change based on courier availability and your location.",
                } : null,
                totalLabel: "Total Payable",
                total,
                formatMoney: (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`,
                action: {
                  label: loading ? "Processing..." : activePayment === "cod" ? "Place COD Order" : "Pay & Place Order",
                  onClick: handlePlaceOrder,
                  disabled: loading || shippingLoading || payableCart.length === 0,
                },
                couponModalOpen,
                setCouponModalOpen,
                couponCodeOpen: couponPanelOpen,
                setCouponCodeOpen: setCouponPanelOpen,
                couponCelebration,
              }}
            />
            {false && (
            <>
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
                    <small>Rs. {PREPAID_DISCOUNT_AMOUNT.toLocaleString("en-IN")} extra off</small>
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
                  <h3>Review your order</h3>
                  <button type="button" onClick={() => setCheckoutStep("details")}>
                    <Icon icon="lucide:arrow-left" />
                    Edit
                  </button>
                </div>
                <div className="checkout-review-grid">
                  <div className="checkout-review-panel">
                    <span>Products</span>
                    {cart.map((item) => (
                      <div key={`${item.id}-${item.colorId}-review`} className="checkout-review-product">
                        <img src={imgUrl(item.image_url)} alt="" />
                        <div>
                          <strong>{item.name}</strong>
                          <small>Qty {item.quantity} x Rs. {Number(item.price).toLocaleString("en-IN")}</small>
                        </div>
                        <b>Rs. {(Number(item.price) * Number(item.quantity || 1)).toLocaleString("en-IN")}</b>
                      </div>
                    ))}
                  </div>
                  <div className="checkout-review-panel">
                    <span>Deliver to</span>
                    <strong>{formData.fullName}</strong>
                    <p>{[formData.address, formData.city, formData.pincode].filter(Boolean).join(", ")}</p>
                    <small>{formData.phone}</small>
                  </div>
                  <div className="checkout-review-panel">
                    <span>Payment</span>
                    <strong>{activePayment === "cod" ? "Cash on Delivery" : "Online Payment"}</strong>
                    <p>{activePayment === "cod" ? "Pay when your order is delivered." : "Pay securely with Razorpay."}</p>
                  </div>
                </div>
              </section>
              )}
            </div>

            <div className="lg:col-span-4">
              <div className="summary-card sticky top-28">
                <div className="checkout-summary-card bg-white rounded-2xl p-8 shadow-xl border border-[#D4AF37]/20">
                  <CheckoutReviewSummary
                    title="Order Summary"
                    items={cart.map((item) => ({
                      key: `${item.id}-${item.colorId}`,
                      href: `/product/${item.slug}`,
                      image: item.image_url,
                      name: item.name,
                      meta: `${item.quantity} x Rs. ${Number(item.price).toLocaleString("en-IN")}`,
                      total: `Rs. ${(Number(item.price) * Number(item.quantity || 1)).toLocaleString("en-IN")}`,
                    }))}
                    showOffers={checkoutStep === "review"}
                    coupons={availableCoupons}
                    appliedCoupon={appliedCoupon}
                    couponDiscount={effectiveCouponDiscount}
                    couponCode={couponCode}
                    setCouponCode={setCouponCode}
                    onApplyCoupon={applyCheckoutCoupon}
                    onRemoveCoupon={removeCheckoutCoupon}
                    walletBalance={walletBalance}
                    useWallet={useWallet}
                    setUseWallet={setUseWallet}
                    rows={[
                      { label: "Subtotal", value: `Rs. ${subtotal.toLocaleString("en-IN")}` },
                      ...(appliedCoupon ? [{ label: `Coupon (${appliedCoupon.code})`, value: `-Rs. ${effectiveCouponDiscount.toLocaleString("en-IN")}`, tone: "success" }] : []),
                      { label: "Free delivery charge", value: shippingLoading ? "Calculating..." : shippingCharge > 0 ? <><s>Rs. {shippingCharge.toLocaleString("en-IN")}</s> Free</> : "Free", tone: "success" },
                      ...(paymentDiscount > 0 ? [{ label: "Prepaid payment discount", value: `-Rs. ${paymentDiscount.toLocaleString("en-IN")}`, tone: "success" }] : []),
                      ...(paymentFee > 0 ? [{ label: "COD charge", value: `Rs. ${paymentFee.toLocaleString("en-IN")}`, tone: "accent" }] : []),
                      { label: "Platform fee", value: `Rs. ${platformFee.toLocaleString("en-IN")}` },
                      ...(walletUsableAmount > 0 ? [{ label: "Wallet used", value: `-Rs. ${walletUsableAmount.toLocaleString("en-IN")}`, tone: "success" }] : []),
                    ]}
                    logistics={shippingCharge > 0 ? {
                      label: "Returns & exchange available",
                      tooltip: shippingDiscountReason === "first_order"
                        ? "Return and exchange are available. For your first order, delivery charge will not be deducted."
                        : `Return and exchange are available. On return, refund may deduct Rs. ${returnDeliveryDeduction.toLocaleString("en-IN")} delivery charge.`,
                    } : null}
                    totalLabel="Total Payable"
                    total={total}
                    formatMoney={(value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`}
                    action={{
                      label: checkoutStep === "details"
                        ? (shippingLoading ? "Checking delivery..." : "Continue")
                        : (loading ? "Processing..." : activePayment === "cod" ? "Place COD Order" : "Pay & Place Order"),
                      onClick: checkoutStep === "details" ? proceedToReview : handlePlaceOrder,
                      disabled: checkoutStep === "details" ? shippingLoading : loading,
                    }}
                    couponModalOpen={couponModalOpen}
                    setCouponModalOpen={setCouponModalOpen}
                    couponCodeOpen={couponPanelOpen}
                    setCouponCodeOpen={setCouponPanelOpen}
                    couponCelebration={couponCelebration}
                  />
                  <h3 className="text-xl font-bold text-[#3D2817] mb-8 uppercase tracking-widest border-b border-[#D4AF37]/10 pb-4 brand-font">Order Summary</h3>
                  <div className="space-y-6 mb-8">
                    {cart.map((item) => {
                      const productName = item.name;

                      return (
                      <div key={`${item.id}-${item.colorId}`} className="flex items-center space-x-4">
                        <Link to={`/product/${item.slug}`} className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-[#F5F1E8]" aria-label={`Open ${productName}`}><img src={imgUrl(item.image_url)} className="w-full h-full object-cover" alt={productName} /></Link>
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

                  {checkoutStep === "review" && (
                    <div className="checkout-summary-actions">
                      <div className="checkout-offers-head">
                        <Icon icon="lucide:badge-percent" />
                        <strong>Coupons & offers</strong>
                      </div>
                      <button type="button" className="checkout-coupon-feature" onClick={() => (appliedCoupon ? null : applyCheckoutCoupon(availableCoupons[0]))} disabled={Boolean(appliedCoupon) || !availableCoupons[0]}>
                        <span className="checkout-coupon-badge"><Icon icon="lucide:percent" /></span>
                        <span className="checkout-coupon-copy">
                          <strong>{appliedCoupon ? `Applied ${appliedCoupon.code}` : getCouponSavingsText(availableCoupons[0])}</strong>
                          <small>{appliedCoupon ? `Rs. ${effectiveCouponDiscount.toLocaleString("en-IN")} saved on this order` : getCouponSubtext(availableCoupons[0])}</small>
                        </span>
                        <Icon icon={appliedCoupon ? "lucide:check-circle-2" : "lucide:chevron-right"} />
                      </button>
                      {appliedCoupon && (
                        <button type="button" className="checkout-remove-coupon" onClick={removeCheckoutCoupon}>
                          Remove coupon
                        </button>
                      )}
                      {!appliedCoupon && availableCoupons.length > 1 && (
                        <button type="button" className="checkout-view-coupons" onClick={() => setCouponModalOpen(true)}>
                          View all coupons
                          <Icon icon="lucide:chevron-right" />
                        </button>
                      )}
                      <label className={`checkout-wallet-row ${Number(walletBalance || 0) <= 0 ? "disabled" : ""}`}>
                        <span>
                          <strong>Use wallet money</strong>
                          <small>Available Rs. {Number(walletBalance || 0).toLocaleString("en-IN")}</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={useWallet}
                          disabled={Number(walletBalance || 0) <= 0}
                          onChange={(event) => setUseWallet(event.target.checked)}
                        />
                      </label>
                    </div>
                  )}

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

                    <div className="flex justify-between items-center text-xs text-emerald-600 font-bold">
                      <span>FREE DELIVERY CHARGE</span>
                      <span>{shippingLoading ? "CALCULATING..." : shippingCharge > 0 ? <><s>Rs. {shippingCharge.toLocaleString("en-IN")}</s> Free</> : "FREE"}</span>
                    </div>
                    {paymentDiscount > 0 && (
                      <div className="flex justify-between items-center text-xs text-emerald-600 font-bold">
                        <span>PREPAID DISCOUNT</span>
                        <span>-Rs. {paymentDiscount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {paymentFee > 0 && (
                      <div className="flex justify-between items-center text-xs text-[#800020] font-bold">
                        <span>COD FEE</span>
                        <span>Rs. {paymentFee.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 uppercase tracking-widest font-bold">Platform fee</span>
                      <span className="font-bold text-[#3D2817]">Rs. {platformFee.toLocaleString("en-IN")}</span>
                    </div>
                    {walletUsableAmount > 0 && (
                      <div className="flex justify-between items-center text-xs text-emerald-600 font-bold">
                        <span>WALLET USED</span>
                        <span>-Rs. {walletUsableAmount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {shippingCharge > 0 && (
                      <div className="checkout-logistics-note">
                        <span>Returns & exchange available</span>
                        <button
                          type="button"
                          className="checkout-info-chip"
                          aria-label="Return and exchange information"
                          data-tooltip={
                            shippingDiscountReason === "first_order"
                              ? "Return and exchange are available. For your first order, delivery charge will not be deducted."
                              : `Return and exchange are available. On return, refund may deduct Rs. ${returnDeliveryDeduction.toLocaleString("en-IN")} delivery charge.`
                          }
                        >
                          <Icon icon="lucide:info" />
                        </button>
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
            </>
            )}
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
                  {addrFormErrors.house_building && <em className="buy-now-field-error">{addrFormErrors.house_building}</em>}
                </label>
                <label>
                  <span>Area, Street, Sector</span>
                  <input name="area_street" value={addressForm.area_street} onChange={handleAddressFormChange} />
                </label>
                <div className="buy-now-form-row">
                  <label>
                    <span>City *</span>
                    <input name="city" value={addressForm.city} onChange={handleAddressFormChange} />
                    {addrFormErrors.city && <em className="buy-now-field-error">{addrFormErrors.city}</em>}
                  </label>
                  <label>
                    <span>State *</span>
                    <input name="state" value={addressForm.state} onChange={handleAddressFormChange} />
                    {addrFormErrors.state && <em className="buy-now-field-error">{addrFormErrors.state}</em>}
                  </label>
                </div>
                <div className="buy-now-form-row">
                  <label>
                    <span>Pincode *</span>
                    <input name="pincode" inputMode="numeric" value={addressForm.pincode} onChange={handleAddressFormChange} />
                    {addrFormErrors.pincode && <em className="buy-now-field-error">{addrFormErrors.pincode}</em>}
                  </label>
                  <label>
                    <span>Phone *</span>
                    <div className="buy-now-phone-input">
                      <span className="buy-now-country-code"><span className="buy-now-flag-india" aria-hidden="true" />+91</span>
                      <input name="phone" inputMode="tel" maxLength={10} placeholder="10-digit mobile number" value={addressForm.phone} onChange={handleAddressFormChange} />
                    </div>
                    {addrFormErrors.phone && <em className="buy-now-field-error">{addrFormErrors.phone}</em>}
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
      {couponModalOpen && (
        <div className="checkout-coupon-modal" role="dialog" aria-modal="true" aria-label="Coupons and offers">
          <div className="checkout-coupon-modal-card">
            <button type="button" className="checkout-coupon-modal-close" onClick={() => setCouponModalOpen(false)} aria-label="Close coupons">
              <Icon icon="lucide:x" />
            </button>
            <div className="checkout-coupon-modal-title">
              <Icon icon="lucide:badge-percent" />
              <div>
                <span>Checkout offers</span>
                <h3>Coupons & offers</h3>
              </div>
            </div>
            <button type="button" className="checkout-manual-coupon" onClick={() => setCouponPanelOpen((open) => !open)}>
              Have a coupon code?
              <Icon icon={couponPanelOpen ? "lucide:chevron-up" : "lucide:chevron-down"} />
            </button>
            {couponPanelOpen && (
              <div className="checkout-coupon-panel">
                <div className="checkout-coupon-entry">
                  <input
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    placeholder="Coupon code"
                  />
                  <button type="button" onClick={() => applyCheckoutCoupon()}>Apply</button>
                </div>
              </div>
            )}
            {availableCoupons.length > 0 ? (
              <div className="checkout-coupon-list">
                {availableCoupons.map((coupon) => (
                  <button key={coupon.id || coupon.code} type="button" onClick={() => applyCheckoutCoupon(coupon)}>
                    <span className="checkout-coupon-code">{coupon.code}</span>
                    <span className="checkout-coupon-detail">
                      <strong>{getCouponSavingsText(coupon)}</strong>
                      <small>{getCouponSubtext(coupon)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="checkout-coupon-empty">No coupons are available right now.</p>
            )}
          </div>
        </div>
      )}
      {couponCelebration && (
        <div className="checkout-coupon-boom" role="status" aria-live="polite">
          <span><Icon icon="lucide:sparkles" /></span>
          <div>
            <strong>Yay! Coupon applied</strong>
            <p>{couponCelebration.discount > 0 ? `Rs. ${Number(couponCelebration.discount).toLocaleString("en-IN")} off with ${couponCelebration.code}` : `${couponCelebration.code} is active on this order`}</p>
          </div>
        </div>
      )}
      <LocationPickerModal
        open={mapOpen}
        initialQuery={[addressForm.house_building, addressForm.city, addressForm.state].filter(Boolean).join(", ")}
        onClose={() => setMapOpen(false)}
        onConfirm={confirmMapLocation}
      />

      {paymentVerifying && (
        <div className="checkout-processing-overlay">
          <div className="checkout-processing-card">
            <span className="checkout-processing-spinner" />
            <strong>Processing your payment…</strong>
            <p>Please wait, do not close this page.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Checkout;
