import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useNotification } from "../../context/NotificationContext";
import { useWishlist } from "../../context/WishlistContext";
import { API_ENDPOINTS } from "../../config/api";
import api from "../../utils/api";
import { getProductCoverImage, getProductImages } from "../../utils/productMedia";
import { getProductStockInfo } from "../../utils/stockStatus";
import { LocationPickerModal } from "../Profile/Profile";
import CheckoutReviewSummary from "../../components/CheckoutReviewSummary";
import CheckoutOrderPanel from "../../components/CheckoutOrderPanel";
import { formatEstimatedDeliveryDate, getEstimatedDeliveryDate } from "../../utils/deliveryDate";
import { getVariantSku } from "../../utils/itemCode";
import { selectBestCourier } from "../../utils/courierSelection";
import { numberEnv } from "../../utils/env";
import "./ProductDetail.css";

const PRODUCT_RATING = "4.8";
const PRODUCT_REVIEW_COUNT = "124";
const PACKAGING_WEIGHT_KG = numberEnv("VITE_PACKAGING_WEIGHT_KG");
const COD_MAX_AMOUNT = numberEnv("VITE_COD_MAX_AMOUNT");
const COD_FEE_AMOUNT = numberEnv("VITE_COD_FEE_AMOUNT");
const PLATFORM_FEE_AMOUNT = numberEnv("VITE_PLATFORM_FEE_AMOUNT");
const EMPTY_BUY_NOW_ADDRESS = {
  label: "Home",
  name: "",
  phone: "",
  alternate_phone: "",
  country: "India",
  house_building: "",
  area_street: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  delivery_instructions: "",
  map_address: "",
  map_lat: "",
  map_lng: "",
  is_default: true,
};

const getEmptyBuyNowAddress = (user) => ({
  ...EMPTY_BUY_NOW_ADDRESS,
  name: user?.name || "",
  phone: user?.phone || "",
});

const cleanAddress = (address = {}) => ({
  ...EMPTY_BUY_NOW_ADDRESS,
  ...address,
  phone: String(address.phone || "").replace(/[^\d+]/g, ""),
  pincode: String(address.pincode || "").replace(/\D/g, "").slice(0, 6),
});

const getAddressLine = (address = {}) =>
  [address.house_building, address.area_street, address.landmark, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(", ");

const ProductDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { cart, addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { showNotification } = useNotification();

  const [product, setProduct] = useState(null);
  const [allColors, setAllColors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mainImage, setMainImage] = useState("");
  const [selectedColorId, setSelectedColorId] = useState(null);
  const [colorImagesById, setColorImagesById] = useState({});
  const [loadingColorId, setLoadingColorId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [activeAccordion, setActiveAccordion] = useState("description");
  const [isGalleryHovering, setIsGalleryHovering] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [relatedHoverId, setRelatedHoverId] = useState(null);
  const [relatedSlides, setRelatedSlides] = useState({});
  const [deliveryPincode, setDeliveryPincode] = useState("");
  const [deliveryCheckLoading, setDeliveryCheckLoading] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [buyNowStep, setBuyNowStep] = useState("details");
  const [buyNowLoading, setBuyNowLoading] = useState(false);
  const [buyNowPlacing, setBuyNowPlacing] = useState(false);
  const [buyNowAddresses, setBuyNowAddresses] = useState([]);
  const [selectedBuyNowAddressId, setSelectedBuyNowAddressId] = useState("");
  const [buyNowAddressForm, setBuyNowAddressForm] = useState(getEmptyBuyNowAddress(user));
  const [editingBuyNowAddressId, setEditingBuyNowAddressId] = useState(null);
  const [showBuyNowAddressForm, setShowBuyNowAddressForm] = useState(false);
  const [buyNowAddressModalOpen, setBuyNowAddressModalOpen] = useState(false);
  const [buyNowMapOpen, setBuyNowMapOpen] = useState(false);
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  const [buyNowShipping, setBuyNowShipping] = useState(null);
  const [buyNowShippingLoading, setBuyNowShippingLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedBuyNowCoupon, setAppliedBuyNowCoupon] = useState(null);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [buyNowCouponPanelOpen, setBuyNowCouponPanelOpen] = useState(false);
  const [buyNowShowAllCoupons, setBuyNowShowAllCoupons] = useState(false);
  const [buyNowCouponModalOpen, setBuyNowCouponModalOpen] = useState(false);
  const [couponCelebration, setCouponCelebration] = useState(null);

  const frameRef = useRef(null);
  const perspectiveRef = useRef(null);
  const rootRef = useRef(null);

  const getSortedImages = (targetProduct = product) => {
    const unique = Array.from(
      new Map(
        getProductImages(targetProduct || {})
          .map((image) => (typeof image === "string" ? { url: image } : image))
          .filter((image) => image?.url)
          .map((image) => [image.url, image]),
      ).values(),
    );

    return unique.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
  };

  const getCoverColorId = (targetProduct = product) => {
    const images = getSortedImages(targetProduct);
    return images.find((image) => image.is_cover)?.color_id || images[0]?.color_id || null;
  };

  const getFirstImageForColor = (targetProduct, colorId) => {
    const images = getSortedImages(targetProduct);
    const colorImages = images.filter((image) => String(image.color_id) === String(colorId));
    return colorImages[0] || images.find((image) => image.is_cover) || images[0] || null;
  };

  const updateColorInUrl = (colorId, replace = false) => {
    const nextParams = new URLSearchParams(window.location.search);
    if (colorId) nextParams.set("color", String(colorId));
    else nextParams.delete("color");
    const nextUrl = `${window.location.pathname}?${nextParams.toString()}`;
    if (replace) window.history.replaceState(null, "", nextUrl);
    else window.history.pushState(null, "", nextUrl);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const initialColor = searchParams.get("color");
        const [prodRes, relatedRes] = await Promise.all([
          fetch(`${API_ENDPOINTS.products}/${slug}/detail${initialColor ? `?color=${encodeURIComponent(initialColor)}` : ""}`),
          fetch(`${API_ENDPOINTS.products}?view=collection&limit=5&status=active`),
        ]);

        if (!prodRes.ok) throw new Error("Product not found");

        const [prodData, relatedData] = await Promise.all([
          prodRes.json(),
          relatedRes.json(),
        ]);

        const sortedImages = getSortedImages(prodData);
        const initialColorId = prodData.selected_color_id || getCoverColorId(prodData);
        const initialImage = sortedImages[0] || getFirstImageForColor(prodData, initialColorId);

        setProduct(prodData);
        setAllColors(Array.isArray(prodData.colors) ? prodData.colors : []);
        setSelectedColorId(initialColorId);
        setColorImagesById(initialColorId ? { [String(initialColorId)]: sortedImages } : {});
        setMainImage(initialImage?.url || prodData.image_url || "");
        setProducts((relatedData.items || relatedData.rows || relatedData || []).filter((item) => item.slug !== slug));
        if (initialColorId && String(searchParams.get("color")) !== String(initialColorId)) updateColorInUrl(initialColorId, true);
      } catch (error) {
        console.error("Error fetching product:", error);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  useEffect(() => {
    const frame = frameRef.current;
    const perspective = perspectiveRef.current;

    const handleMouseMove = (event) => {
      if (!perspective || !frame) return;
      const rect = perspective.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -6;
      const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 6;
      frame.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    };

    const handleMouseLeave = () => {
      if (frame) frame.style.transform = "rotateX(0deg) rotateY(0deg)";
    };

    if (perspective) {
      perspective.addEventListener("mousemove", handleMouseMove);
      perspective.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      if (perspective) {
        perspective.removeEventListener("mousemove", handleMouseMove);
        perspective.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, [loading]);

  const visibleImages = useMemo(() => {
    if (!selectedColorId) return getSortedImages(product);
    return colorImagesById[String(selectedColorId)] || [];
  }, [product, selectedColorId, colorImagesById]);

  const distinctColors = useMemo(() => {
    return allColors;
  }, [allColors]);

  const selectedColor = distinctColors.find((color) => String(color.id) === String(selectedColorId));
  const selectedSku = getVariantSku(product, selectedColorId, selectedColor?.slug || selectedColor?.name);
  const productStockInfo = getProductStockInfo(product);
  const isProductOutOfStock = productStockInfo.isOutOfStock;
  const selectedStockInfo = getProductStockInfo({
    ...product,
    stock_quantity: isProductOutOfStock ? product?.stock_quantity : selectedColor?.stock_quantity ?? product?.stock_quantity,
  });
  const isSelectedOutOfStock = isProductOutOfStock || selectedStockInfo.isOutOfStock;
  const isSelectedLowStock = selectedStockInfo.isLowStock;
  const isChangingColor = Boolean(loadingColorId);
  const showThumbSkeletons = isChangingColor && visibleImages.length === 0;
  const canAddToBag = !isSelectedOutOfStock && !isChangingColor && quantity <= selectedStockInfo.quantity;
  const availableQuantity = isSelectedOutOfStock ? 0 : Math.max(0, Math.floor(Number(selectedStockInfo.quantity || 0)));
  const quantityOptions = availableQuantity > 0 ? Array.from({ length: availableQuantity }, (_, index) => index + 1) : [0];
  const formatMoney = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
  const formatDeliveryDate = (value) => {
    if (!value) return "";
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return value;
    return parsedDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };
  const getCouponSavingsText = (coupon) => {
    if (!coupon) return "Coupons & offers";
    const code = String(coupon.code || "").toUpperCase();
    if (coupon.discount_type === "percentage") return `Save ${Number(coupon.discount_percent || 0)}% with ${code}`;
    return `Save ${formatMoney(coupon.discount_amount)} with ${code}`;
  };
  const getCouponSubtext = (coupon) => {
    if (!coupon) return "Choose an offer for this order.";
    const minAmount = Number(coupon.min_purchase_amount || 0);
    if (minAmount > buyNowSubtotal) {
      return `Shop for ${formatMoney(minAmount - buyNowSubtotal)} more to apply`;
    }
    return coupon.description || "Tap to apply this offer at checkout.";
  };
  const productName = product?.name || "";
  const buyNowSubtotal = Number(product?.selling_price || 0) * Math.max(1, Number(quantity || 1));
  const selectedBuyNowAddress = buyNowAddresses.find((address) => String(address.id) === String(selectedBuyNowAddressId));
  const canUseCod = buyNowSubtotal <= COD_MAX_AMOUNT;
  const buyNowShippingRate = Number(buyNowShipping?.rate || 0);
  const qualifiesForFreeShipping = buyNowShippingRate > 0;
  const shippingDiscountReasonCode = buyNowShippingRate > 0 ? (isFirstOrder ? "first_order" : "free_delivery") : null;
  const freeShippingReason = isFirstOrder
    ? "First order free delivery"
    : "Free delivery charge";
  const buyNowShippingDiscount = qualifiesForFreeShipping ? buyNowShippingRate : 0;
  const buyNowFinalShipping = Math.max(0, buyNowShippingRate - buyNowShippingDiscount);
  const buyNowReturnDeliveryDeduction = shippingDiscountReasonCode === "first_order" ? 0 : buyNowShippingRate;
  const buyNowPaymentFee = COD_FEE_AMOUNT;
  const buyNowPlatformFee = PLATFORM_FEE_AMOUNT;
  const buyNowPaymentDiscount = 0;
  const buyNowGrossTotal = Math.max(0, buyNowSubtotal + buyNowFinalShipping + buyNowPaymentFee + buyNowPlatformFee - buyNowPaymentDiscount);
  const buyNowCouponDiscount = Math.min(Number(appliedBuyNowCoupon?.discount || 0), buyNowGrossTotal);
  const walletUsableAmount = useWallet ? Math.min(Number(walletBalance || 0), Math.max(0, buyNowGrossTotal - buyNowCouponDiscount)) : 0;
  const buyNowTotal = Math.max(0, buyNowGrossTotal - buyNowCouponDiscount - walletUsableAmount);
  const formatNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "";
  };

  const handleColorChange = async (colorId) => {
    const cachedImages = colorImagesById[String(colorId)];
      setSelectedColorId(colorId);
      updateColorInUrl(colorId);
      setActiveImageIndex(0);
    if (cachedImages?.length) {
      setMainImage(cachedImages[0].url);
      return;
    }

    setLoadingColorId(colorId);
    try {
      const response = await fetch(`${API_ENDPOINTS.products}/${slug}/colors/${colorId}/images`);
      const data = await response.json();
      const images = getSortedImages({ images: data.images || [] });
      setColorImagesById((current) => ({ ...current, [String(colorId)]: images }));
      setAllColors((current) =>
        current.map((color) =>
          String(color.id) === String(colorId)
            ? { ...color, stock_quantity: data.stock_quantity, stock_status: data.stock_status }
            : color,
        ),
      );
      setMainImage(images[0]?.url || "");
    } catch (error) {
      console.error("Error loading color images:", error);
      showNotification("Could not load this color. Please try again.", "warning");
    } finally {
      setLoadingColorId(null);
    }
  };

  useEffect(() => {
    if (!isGalleryHovering || visibleImages.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setActiveImageIndex((current) => {
        const next = (current + 1) % visibleImages.length;
        setMainImage(visibleImages[next]?.url || "");
        return next;
      });
    }, 1450);

    return () => window.clearInterval(timer);
  }, [isGalleryHovering, visibleImages]);

  useEffect(() => {
    if (!relatedHoverId) return undefined;
    const target = products.find((item) => item.id === relatedHoverId);
    const imageCount = getSortedImages(target).length;
    if (imageCount <= 1) return undefined;

    const timer = window.setInterval(() => {
      setRelatedSlides((current) => ({
        ...current,
        [relatedHoverId]: ((current[relatedHoverId] || 0) + 1) % imageCount,
      }));
    }, 1450);

    return () => window.clearInterval(timer);
  }, [relatedHoverId, products]);

  useEffect(() => {
    if (!products.length) return undefined;

    const timer = window.setInterval(() => {
      setRelatedSlides((current) => {
        const next = { ...current };
        products.slice(0, 4).forEach((item) => {
          if (item.id === relatedHoverId) return;
          const count = getSortedImages(item).length;
          if (count > 1) next[item.id] = ((next[item.id] || 0) + 1) % count;
        });
        return next;
      });
    }, 1850);

    return () => window.clearInterval(timer);
  }, [products, relatedHoverId]);

  const incrementQty = () => {
    if (isSelectedOutOfStock) return;
    if (quantity >= selectedStockInfo.quantity) {
      showNotification(`Only ${selectedStockInfo.quantity} item${selectedStockInfo.quantity === 1 ? "" : "s"} are available for this product.`, "warning");
      return;
    }
    setQuantity((prev) => prev + 1);
  };
  const decrementQty = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  useEffect(() => {
    if (!isSelectedOutOfStock && selectedStockInfo.quantity > 0 && quantity > selectedStockInfo.quantity) {
      setQuantity(selectedStockInfo.quantity);
    }
  }, [isSelectedOutOfStock, quantity, selectedStockInfo.quantity]);

  useEffect(() => {
    if (!buyNowOpen || !selectedBuyNowAddress?.pincode || isSelectedOutOfStock) {
      setBuyNowShipping(null);
      setBuyNowShippingLoading(false);
      return undefined;
    }

    const cleanPincode = String(selectedBuyNowAddress.pincode || "").trim();
    if (!/^\d{6}$/.test(cleanPincode)) {
      setBuyNowShipping(null);
      setBuyNowShippingLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setBuyNowShippingLoading(true);
        const rawWeight = Number(product?.weight);
        const productWeightKg = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 0.5;
        const totalQty = Math.max(1, Number(quantity || 1));
        const totalWeightKg = (productWeightKg * totalQty) + (PACKAGING_WEIGHT_KG * totalQty);
        const response = await fetch(
          `${API_ENDPOINTS.shiprocket}/serviceability?pincode=${encodeURIComponent(cleanPincode)}&weight=${Math.max(0.1, Number(totalWeightKg.toFixed(3)))}&is_cod=1`,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || "Unable to check delivery");

        const selected = selectBestCourier(data?.data?.available_courier_companies || [], {
          weightKg: Math.max(0.1, Number(totalWeightKg.toFixed(3))),
          requireCod: canUseCod,
        });

        if (!cancelled) {
          setBuyNowShipping(selected ? {
            ...selected,
            deliveryDate: formatEstimatedDeliveryDate(getEstimatedDeliveryDate(selected.etd)),
          } : { unavailable: true, message: "Delivery is not possible at this location right now." });
        }
      } catch (error) {
        if (!cancelled) {
          setBuyNowShipping({ unavailable: true, message: error.message || "Delivery unavailable" });
        }
      } finally {
        if (!cancelled) setBuyNowShippingLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buyNowOpen, selectedBuyNowAddress?.pincode, canUseCod, quantity, product?.weight, isSelectedOutOfStock]);

  useEffect(() => {
    if (!couponCelebration) return undefined;
    const timer = window.setTimeout(() => setCouponCelebration(null), 2400);
    return () => window.clearTimeout(timer);
  }, [couponCelebration]);

  useEffect(() => {
    if (!buyNowOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [buyNowOpen]);

  const handleAddToCart = async () => {
    if (!user) {
      showNotification("Please login first", "info");
      navigate("/cart");
      return;
    }

    if (isSelectedOutOfStock || quantity > selectedStockInfo.quantity) {
      showNotification(selectedStockInfo.colorMessage || "This product is out of stock.", "warning");
      return;
    }

    const existingBagQuantity = cart
      .filter((item) => Number(item.id) === Number(product.id) && String(item.colorId || "") === String(selectedColorId || ""))
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const canAddMore = Math.max(0, selectedStockInfo.quantity - existingBagQuantity);
    if (quantity > canAddMore) {
      showNotification(
        canAddMore > 0
          ? `You already have ${existingBagQuantity} in your bag. You can add only ${canAddMore} more.`
          : `You already have all available ${selectedStockInfo.quantity} item(s) in your bag.`,
        "warning"
      );
      return;
    }

    const result = await addToCart(product, quantity, selectedColorId);
    showNotification(result.success ? "Added to Bag!" : result.message, result.success ? "success" : "warning");
  };

  const resetBuyNowForm = () => {
    setEditingBuyNowAddressId(null);
    setBuyNowAddressForm(getEmptyBuyNowAddress(user));
  };

  const openBuyNowAddressModal = (address = null) => {
    if (address) {
      setEditingBuyNowAddressId(address.id);
      setBuyNowAddressForm(cleanAddress(address));
    } else {
      resetBuyNowForm();
    }
    setShowBuyNowAddressForm(true);
    setBuyNowAddressModalOpen(true);
  };

  const closeBuyNowAddressModal = () => {
    setBuyNowAddressModalOpen(false);
    setShowBuyNowAddressForm(false);
    setBuyNowMapOpen(false);
    resetBuyNowForm();
  };

  const loadBuyNowData = async () => {
    setBuyNowLoading(true);
    try {
      const [addressRes, orderRes, walletRes, couponRes] = await Promise.all([
        api.get("/api/addresses"),
        user ? api.get("/api/orders/my").then((res) => res.data).catch(() => []) : Promise.resolve([]),
        api.get("/api/wallet").catch(() => ({ data: { wallet_balance: 0 } })),
        fetch(API_ENDPOINTS.coupons).then((res) => (res.ok ? res.json() : [])).catch(() => []),
      ]);
      const addresses = Array.isArray(addressRes.data) ? addressRes.data.map(cleanAddress) : [];
      const defaultAddress = addresses.find((address) => address.is_default) || addresses[0];
      setBuyNowAddresses(addresses);
      setSelectedBuyNowAddressId(defaultAddress?.id ? String(defaultAddress.id) : "");
      setShowBuyNowAddressForm(false);
      setBuyNowAddressForm(defaultAddress ? cleanAddress(defaultAddress) : getEmptyBuyNowAddress(user));
      setIsFirstOrder(!Array.isArray(orderRes) || orderRes.length === 0);
      setWalletBalance(Number(walletRes?.data?.wallet_balance || 0));
      setAvailableCoupons(Array.isArray(couponRes) ? couponRes.filter((coupon) => coupon?.is_active !== false) : []);
    } catch (error) {
      showNotification(error?.response?.data?.message || "Unable to load saved addresses.", "warning");
      setBuyNowAddresses([]);
      setSelectedBuyNowAddressId("");
      setShowBuyNowAddressForm(false);
      setIsFirstOrder(false);
      setWalletBalance(0);
      setAvailableCoupons([]);
    } finally {
      setBuyNowLoading(false);
    }
  };

  const openBuyNowModal = async () => {
    if (!user) {
      showNotification("Please login first", "info");
      navigate("/cart");
      return;
    }

    if (isSelectedOutOfStock || quantity > selectedStockInfo.quantity) {
      showNotification(selectedStockInfo.colorMessage || "This product is out of stock.", "warning");
      return;
    }

    setBuyNowStep("details");
    setAppliedBuyNowCoupon(null);
    setCouponCode("");
    setBuyNowCouponPanelOpen(false);
    setBuyNowShowAllCoupons(false);
    setBuyNowCouponModalOpen(false);
    setCouponCelebration(null);
    setUseWallet(false);
    setBuyNowOpen(true);
    await loadBuyNowData();
  };

  const closeBuyNowModal = () => {
    if (buyNowPlacing) return;
    setBuyNowOpen(false);
    setBuyNowStep("details");
    setBuyNowShipping(null);
    setShowBuyNowAddressForm(false);
    setBuyNowAddressModalOpen(false);
    setBuyNowMapOpen(false);
    setAppliedBuyNowCoupon(null);
    setCouponCode("");
    setBuyNowCouponPanelOpen(false);
    setBuyNowShowAllCoupons(false);
    setBuyNowCouponModalOpen(false);
    setCouponCelebration(null);
    setUseWallet(false);
    resetBuyNowForm();
  };

  const applyBuyNowCoupon = async (nextCode = couponCode) => {
    const code = String(nextCode || "").trim().toUpperCase();
    if (!code) {
      showNotification("Please enter coupon code.", "warning");
      return;
    }

    try {
      setCouponLoading(true);
      const response = await fetch(`${API_ENDPOINTS.coupons}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, amount: buyNowGrossTotal, email: user?.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Invalid coupon code.");
      setAppliedBuyNowCoupon(data);
      setCouponCode(code);
      setBuyNowCouponPanelOpen(false);
      setBuyNowShowAllCoupons(false);
      setBuyNowCouponModalOpen(false);
      setCouponCelebration({
        code,
        discount: Number(data.discount || data.discount_amount || 0),
      });
      showNotification(`Coupon ${code} applied.`, "success");
    } catch (error) {
      setAppliedBuyNowCoupon(null);
      showNotification(error.message || "Unable to apply coupon.", "warning");
    } finally {
      setCouponLoading(false);
    }
  };

  const removeBuyNowCoupon = () => {
    setAppliedBuyNowCoupon(null);
    setCouponCode("");
    setBuyNowCouponPanelOpen(false);
    setBuyNowShowAllCoupons(false);
    setBuyNowCouponModalOpen(false);
    setCouponCelebration(null);
    showNotification("Coupon removed.", "info");
  };

  const proceedToFinalPayment = () => {
    if (!selectedBuyNowAddress) {
      showNotification("Please select or save a delivery address.", "warning");
      return;
    }
    if (!/^\d{6}$/.test(String(selectedBuyNowAddress.pincode || ""))) {
      showNotification("Please add a valid delivery pincode.", "warning");
      return;
    }
    if (!buyNowShipping || buyNowShipping.unavailable) {
      showNotification("Delivery is unavailable for this address right now.", "warning");
      return;
    }
    if (!canUseCod) {
      showNotification(`COD is available only up to ${formatMoney(COD_MAX_AMOUNT)}.`, "warning");
      return;
    }
    setBuyNowStep("payment");
  };

  const handleBuyNowAddressChange = (event) => {
    const { name, value, type, checked } = event.target;
    setBuyNowAddressForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : name === "pincode" ? value.replace(/\D/g, "").slice(0, 6) : value,
    }));
  };

  const editBuyNowAddress = (address) => {
    openBuyNowAddressModal(address);
  };

  const confirmBuyNowLocation = (location) => {
    setBuyNowAddressForm((current) => ({
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
    setBuyNowMapOpen(false);
  };

  const saveBuyNowAddress = async () => {
    const form = cleanAddress(buyNowAddressForm);
    if (!form.house_building || !form.city || !form.state || !/^\d{6}$/.test(form.pincode) || !form.phone) {
      showNotification("Please fill complete delivery address.", "warning");
      return;
    }

    try {
      setBuyNowLoading(true);
      const payload = {
        ...form,
        name: form.name || user?.name || "",
        phone: form.phone || user?.phone || "",
      };
      const response = editingBuyNowAddressId
        ? await api.put(`/api/addresses/${editingBuyNowAddressId}`, payload)
        : await api.post("/api/addresses", payload);
      const saved = cleanAddress(response.data);
      const addressRes = await api.get("/api/addresses");
      const addresses = Array.isArray(addressRes.data) ? addressRes.data.map(cleanAddress) : [saved];
      setBuyNowAddresses(addresses);
      setSelectedBuyNowAddressId(String(saved.id));
      setBuyNowAddressForm(saved);
      setEditingBuyNowAddressId(null);
      setShowBuyNowAddressForm(false);
      setBuyNowAddressModalOpen(false);
      showNotification("Address saved.", "success");
    } catch (error) {
      showNotification(error?.response?.data?.message || "Unable to save address.", "warning");
    } finally {
      setBuyNowLoading(false);
    }
  };

  const buildBuyNowOrder = () => ({
    customer_name: selectedBuyNowAddress?.name || user?.name || "Customer",
    customer_email: user?.email,
    address: getAddressLine(selectedBuyNowAddress),
    city: selectedBuyNowAddress?.city,
    state: selectedBuyNowAddress?.state || "Uttar Pradesh",
    pincode: selectedBuyNowAddress?.pincode,
    phone: selectedBuyNowAddress?.phone || user?.phone,
    subtotal_amount: buyNowSubtotal,
    shipping_charge: buyNowShippingRate,
    shipping_discount: buyNowShippingDiscount,
    shipping_discount_reason: shippingDiscountReasonCode,
    selected_courier_data: buyNowShipping?.raw || null,
    total_amount: buyNowGrossTotal,
    coupon_code: appliedBuyNowCoupon?.code || null,
    wallet_amount: walletUsableAmount,
    payment_fee: buyNowPaymentFee + buyNowPlatformFee,
    payment_discount: buyNowPaymentDiscount,
    payment_method: "COD",
    payment_status: "Pending",
    items: [{
      id: product.id,
      name: product.name,
      quantity,
      price: Number(product.selling_price || 0),
      colorId: selectedColorId,
      sku: selectedSku,
    }],
  });

  const createBuyNowOrder = async (orderData) => {
    try {
      const response = await api.post("/api/orders", orderData);
      return response.data;
    } catch (error) {
      throw new Error(error?.response?.data?.message || "Unable to place order.");
    }
  };

  const placeBuyNowOrder = async () => {
    if (!selectedBuyNowAddress) {
      showNotification("Please select or save a delivery address.", "warning");
      return;
    }
    if (!/^\d{6}$/.test(String(selectedBuyNowAddress.pincode || ""))) {
      showNotification("Please add a valid delivery pincode.", "warning");
      return;
    }
    if (!buyNowShipping || buyNowShipping.unavailable) {
      showNotification("Delivery is unavailable for this address right now.", "warning");
      return;
    }
    if (!canUseCod) {
      showNotification(`COD is available only up to ${formatMoney(COD_MAX_AMOUNT)}.`, "warning");
      return;
    }

    const orderData = buildBuyNowOrder();
    setBuyNowPlacing(true);
    try {
      const created = await createBuyNowOrder(orderData);
      showNotification("Order placed successfully.", "success");
      navigate(`/order-confirmation?orderId=${created.orderId}`);
    } catch (error) {
      showNotification(error.message || "Unable to place order.", "error");
      setBuyNowPlacing(false);
    }
  };

  const handleWishlist = async () => {
    if (!user) {
      showNotification("Please login first", "info");
      navigate("/wishlist");
      return;
    }
    await toggleWishlist(product);
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: productName, text: productName, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        showNotification("Product link copied with selected color!");
      }
    } catch {
      showNotification("Share cancelled", "info");
    }
  };

  const checkDelivery = async () => {
    if (isSelectedOutOfStock) {
      showNotification("Delivery charges are available when this color is in stock.", "warning");
      return;
    }
    const clean = deliveryPincode.trim();
    if (!/^\d{6}$/.test(clean)) {
      showNotification("Enter valid 6 digit pincode", "warning");
      return;
    }
    try {
      setDeliveryCheckLoading(true);
      setDeliveryQuote(null);
      const rawWeight = Number(product?.weight);
      const productWeightKg = Number.isFinite(rawWeight) && rawWeight > 0 ? (rawWeight > 5 ? rawWeight / 1000 : rawWeight) : 0.5;
      const totalQty = Math.max(1, Number(quantity || 1));
      const totalWeightKg = (productWeightKg * totalQty) + (PACKAGING_WEIGHT_KG * totalQty);
      const response = await fetch(
        `${API_ENDPOINTS.shiprocket}/serviceability?pincode=${encodeURIComponent(clean)}&weight=${Math.max(0.1, Number(totalWeightKg.toFixed(3)))}&is_cod=${canUseCod ? 1 : 0}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Unable to check delivery");

      const selectedOption = selectBestCourier(data?.data?.available_courier_companies || [], {
        weightKg: Math.max(0.1, Number(totalWeightKg.toFixed(3))),
        requireCod: canUseCod,
      });
      if (!selectedOption) {
        setDeliveryQuote({ unavailable: true });
        return;
      }
      setDeliveryQuote({
        option: selectedOption,
        deliveryDate: formatEstimatedDeliveryDate(getEstimatedDeliveryDate(selectedOption.etd)),
      });
    } catch (error) {
      showNotification(error.message || "Unable to check delivery", "warning");
      setDeliveryQuote({ unavailable: true });
    } finally {
      setDeliveryCheckLoading(false);
    }
  };

  const specificationRows = product
    ? [
        ["SKU", selectedSku],
        ["Variety", product.Variety?.name],
        ["Material", product.Material?.name],
        ["Fabric", product.Material?.name],
        ["Occasion", product.Occasion?.name],
        ["Length", product.length ? `${formatNumber(product.length)} m` : ""],
        ["Width", product.width ? `${formatNumber(product.width)} m` : ""],
        ["Weight", product.weight ? `${formatNumber(product.weight)} kg` : ""],
        ["Blouse Piece", product.blouse_piece ? "Included" : ""],
        ["Care", product.care_instructions],
      ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    : [];

  const shippingRows = product
    ? [
        ["Payment", "Cash on Delivery is available for eligible orders."],
        ["COD", `Cash on Delivery is available when product value is ${formatMoney(COD_MAX_AMOUNT)} or below. COD charge is ${formatMoney(COD_FEE_AMOUNT)}.`],
        ["Shipping", "Delivery charge is calculated by pincode and shown as a free delivery discount at payment review."],
        ["Return", "Easy return is available. First-order returns do not deduct delivery charge. Other returns deduct the forward delivery charge."],
        ["Exchange", "Easy exchange is available once with no delivery deduction. After one exchange, return or another exchange is not available for that item."],
        ["Taxes", "Price is inclusive of all taxes."],
      ].filter(Boolean)
    : [];

  if (loading) {
    return (
      <div className="product-detail-page">
        <main className="product-detail-shell">
          <div className="product-detail-skeleton" aria-label="Loading product">
            <div className="product-skeleton-gallery">
              <span className="product-skeleton-thumb" />
              <span className="product-skeleton-thumb" />
              <span className="product-skeleton-thumb" />
              <span className="product-skeleton-image" />
              <div className="product-skeleton-mobile-thumbs" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <span className="product-skeleton-mobile-colors" />
            </div>
            <div className="product-skeleton-info">
              <span className="product-skeleton-line short" />
              <span className="product-skeleton-line title" />
              <span className="product-skeleton-line medium" />
              <span className="product-skeleton-box" />
              <span className="product-skeleton-line medium" />
              <span className="product-skeleton-actions" />
              <span className="product-skeleton-box tall" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="product-detail-page product-detail-loading">
        <div className="text-center">
          <p className="serif-text italic text-2xl text-[#800020] mb-4">This product is no longer available.</p>
          <Link to="/collection" className="text-[#800020] font-bold uppercase tracking-widest border-b border-[#800020]">
            Return to Collection
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="product-detail-page" ref={rootRef}>
      <main className="product-detail-shell">
        <nav className="product-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <Icon icon="lucide:chevron-right" />
          <Link to="/collection">Collections</Link>
            <Icon icon="lucide:chevron-right" />
            <span>{productName}</span>
          </nav>

          <div className="product-mobile-summary">
            <h1>{productName}</h1>
            <p>{product.short_description || [product.Variety?.name, product.Material?.name].filter(Boolean).join(" / ")}</p>
          </div>

        <div className="product-detail-grid">
          <section className="product-gallery">
            <div
              className="product-main-media product-3d-perspective"
              ref={perspectiveRef}
              onMouseEnter={() => setIsGalleryHovering(true)}
              onMouseLeave={() => setIsGalleryHovering(false)}
            >
              <div className="product-3d-frame product-image-frame" ref={frameRef}>
                {loadingColorId ? <span className="product-image-loader" aria-hidden="true" /> : null}
                {visibleImages.length > 0 ? (
                  <div
                    className="product-main-image-track"
                    style={{ transform: `translateX(-${activeImageIndex * 100}%)` }}
                  >
                    {visibleImages.map((image, index) => (
                      <img
                        key={`${image.url}-${index}`}
                        src={image.url}
                        alt={index === activeImageIndex ? productName : ""}
                        className="product-main-image"
                      />
                    ))}
                  </div>
                ) : mainImage ? (
                  <img src={mainImage} alt={productName} className="product-main-image" />
                ) : null}
                {Number(product.discount_percent || 0) > 0 && (
                  <span className="product-discount-badge">{product.discount_percent}% OFF</span>
                )}
                <div className="product-image-actions">
                  <button type="button" onClick={handleWishlist} className={isInWishlist(product.id) ? "active" : ""} aria-label="Wishlist">
                    <Icon icon={isInWishlist(product.id) ? "mdi:heart" : "lucide:heart"} />
                  </button>
                  <button type="button" onClick={handleShare} aria-label="Share">
                    <Icon icon="lucide:share-2" />
                  </button>
                </div>
                {visibleImages.length > 1 && (
                  <div className="product-image-dots" aria-hidden="true">
                    {visibleImages.map((image, index) => (
                      <span key={`${image.url}-dot`} className={index === activeImageIndex ? "active" : ""} />
                    ))}
                  </div>
                )}
                {isSelectedOutOfStock && (
                  <span className="product-image-stock-badge out">Out of stock</span>
                )}
              </div>
            </div>

            <div className={`product-thumbs ${showThumbSkeletons ? "loading" : ""}`}>
              {showThumbSkeletons
                ? Array.from({ length: 6 }).map((_, index) => (
                    <span key={`thumb-skeleton-${index}`} className="product-thumb-skeleton" aria-hidden="true" />
                  ))
                : visibleImages.map((image, index) => (
                    <button
                      key={`${image.url}-${index}`}
                      type="button"
                      onClick={() => {
                        setActiveImageIndex(index);
                        setMainImage(image.url);
                      }}
                      onFocus={() => setActiveImageIndex(index)}
                      onMouseEnter={() => setActiveImageIndex(index)}
                      className={`product-thumb ${mainImage === image.url ? "active" : ""}`}
                      aria-label={`View image ${index + 1}`}
                    >
                      <img src={image.url} alt="" />
                    </button>
                  ))}
            </div>

            {distinctColors.length > 0 && (
              <div className="product-mobile-color-card">
                <p>
                  Selected color <span>{selectedColor?.name || "Choose color"}</span>
                </p>
                <div className="product-mobile-color-list">
                  {distinctColors.map((color) => {
                    const colorStock = getProductStockInfo({ ...product, stock_quantity: color.stock_quantity });
                    const isOut = colorStock.isOutOfStock;
                    const isLow = colorStock.isLowStock;
                    const isActive = String(selectedColorId) === String(color.id);
                    return (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => handleColorChange(color.id)}
                        className={`product-mobile-color-btn ${isActive ? "active" : ""} ${isOut ? "out" : ""} ${isLow ? "low" : ""}`}
                        aria-label={`Select ${color.name}`}
                        aria-pressed={isActive}
                        title={color.name}
                      >
                        <span style={{ backgroundColor: color.hex_code || "#ccc" }} />
                        <strong>{color.name}</strong>
                      </button>
                    );
                  })}
                </div>
                {(isSelectedLowStock || isSelectedOutOfStock) && (
                  <small className={`product-mobile-stock-note ${isSelectedOutOfStock ? "out" : ""}`}>
                    {selectedStockInfo.colorMessage}
                  </small>
                )}
              </div>
            )}
          </section>

          <section className="product-info-panel">
            <span className="product-kicker">
              {[product.Variety?.name, product.Occasion?.name].filter(Boolean).join(" / ") || "Banarasi Kala"}
            </span>
            <h1 className="product-detail-title">{productName}</h1>
            <p className="product-detail-subtitle">
              {[product.Material?.name, selectedColor?.name].filter(Boolean).join(" / ")}
            </p>

            <div className="product-rating-row">
              <span>
                <Icon icon="mdi:star" />
                <Icon icon="mdi:star" />
                <Icon icon="mdi:star" />
                <Icon icon="mdi:star" />
                <Icon icon="mdi:star-half" />
              </span>
              <strong>{PRODUCT_RATING}</strong>
              <small>({PRODUCT_REVIEW_COUNT} Reviews)</small>
            </div>

            <div className="product-price-card">
              <div className="product-price-row">
                <strong>{formatMoney(product.selling_price)}</strong>
                {Number(product.mrp_price || 0) > Number(product.selling_price || 0) && (
                  <>
                    <span>{formatMoney(product.mrp_price)}</span>
                    <em>Save {product.discount_percent}%</em>
                  </>
                )}
              </div>
              <p>Incl. of all taxes </p>
            </div>

            {!isSelectedOutOfStock && (
              <div className="product-delivery-check product-delivery-check-top">
                <p className="product-delivery-helper">Enter pincode to see estimated delivery date.</p>
                <div className="product-delivery-input-row">
                  <input
                    type="text"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="Enter pincode"
                    value={deliveryPincode}
                    onChange={(e) => setDeliveryPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") checkDelivery();
                    }}
                  />
                  <button type="button" onClick={checkDelivery} disabled={deliveryCheckLoading}>
                    {deliveryCheckLoading ? "Checking..." : "Check"}
                  </button>
                </div>
                {deliveryQuote?.unavailable ? (
                  <p className="product-delivery-note">Delivery details unavailable for this pincode.</p>
                ) : deliveryQuote?.deliveryDate ? (
                  <div className="product-delivery-date">
                    <span>Estimated delivery</span>
                    <strong>{deliveryQuote.deliveryDate}</strong>
                  </div>
                ) : null}
              </div>
            )}

            {distinctColors.length > 0 && (
              <div className="product-color-section">
                <p>
                  Select Color: <span>{selectedColor?.name || "Choose color"}</span>
                </p>
                <div className="product-color-list">
                  {distinctColors.map((color) => {
                    const colorStock = getProductStockInfo({ ...product, stock_quantity: color.stock_quantity });
                    const isOut = colorStock.isOutOfStock;
                    const isLow = colorStock.isLowStock;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => handleColorChange(color.id)}
                        className={`product-color-btn ${String(selectedColorId) === String(color.id) ? "active" : ""} ${isOut ? "out" : ""} ${isLow ? "low" : ""}`}
                        aria-disabled={isOut}
                        title={color.name}
                      >
                        <span style={{ backgroundColor: color.hex_code || "#ccc" }} />
                        <strong>{color.name}</strong>
                        {isLow && <small>Few left</small>}
                        {isOut && <small>Out</small>}
                      </button>
                    );
                  })}
                </div>
                {(isSelectedLowStock || isSelectedOutOfStock) && (
                  <div className={`product-stock-note ${isSelectedOutOfStock ? "out" : "low"}`}>
                    {selectedStockInfo.colorMessage}
                  </div>
                )}
              </div>
            )}

            <div className="product-action-panel">
              <div className="product-qty">
                <label htmlFor="product-quantity">Quantity</label>
                <select
                  id="product-quantity"
                  value={isSelectedOutOfStock ? 0 : quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  disabled={isSelectedOutOfStock}
                >
                  {quantityOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={handleAddToCart} className="product-add-btn" disabled={!canAddToBag}>
                <Icon icon="lucide:shopping-bag" />
                {isSelectedOutOfStock ? "Out of Stock" : isChangingColor ? "Loading..." : "Add to Bag"}
              </button>
              <button type="button" onClick={openBuyNowModal} className="product-buy-btn" disabled={!canAddToBag}>
                <Icon icon="lucide:zap" />
                Buy Now
              </button>
            </div>

            <div className="product-accordion">
              {[
                {
                  id: "description",
                  title: "Description",
                  content: <p>{product.description || product.short_description || "Product description will be updated soon."}</p>,
                },
                {
                  id: "specifications",
                  title: "Material & Specifications",
                  content: (
                    <div className="product-spec-grid">
                      {specificationRows.map(([label, value]) => (
                        <div className="product-spec-row" key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  id: "shipping",
                  title: "Shipping & Returns",
                  content: (
                    <>
                      <div className="product-spec-grid">
                        {shippingRows.map(([label, value]) => (
                          <div className="product-spec-row" key={label}>
                            <span>{label}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  ),
                },
              ].map((item) => (
                <div key={item.id} className="product-accordion-item">
                  <button type="button" onClick={() => setActiveAccordion((prev) => (prev === item.id ? null : item.id))}>
                    <span>{item.title}</span>
                    <Icon icon="lucide:chevron-down" className={activeAccordion === item.id ? "rotate" : ""} />
                  </button>
                  <div className={`product-accordion-content ${activeAccordion === item.id ? "open" : ""}`}>
                    {item.content}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {products.length > 0 && (
          <section className="product-related">
            <h2>More Products</h2>
            <div className="product-related-grid">
              {products.slice(0, 4).map((item) => {
                const images = getSortedImages(item);
                const fallbackImage = getProductCoverImage(item, "https://via.placeholder.com/500x650?text=Banarasi+Kala");
                const slideImages = images.length ? images : [{ url: fallbackImage }];
                const activeSlide = relatedSlides[item.id] || 0;
                const hasDiscount = Number(item.mrp_price || 0) > Number(item.selling_price || 0);
                const relatedProductName = item.name;

                return (
                  <Link
                    key={item.id}
                    to={`/product/${item.slug}`}
                    className="product-related-card"
                    onMouseEnter={() => setRelatedHoverId(item.id)}
                    onMouseLeave={() => {
                      setRelatedHoverId((current) => (current === item.id ? null : current));
                    }}
                    onTouchStart={() => setRelatedHoverId(item.id)}
                  >
                    <div className="product-related-media">
                      <div
                        className="product-related-track"
                        style={{ transform: `translateX(-${activeSlide * 100}%)` }}
                      >
                        {slideImages.map((image, index) => (
                          <img key={`${item.id}-${image.url}-${index}`} src={image.url} alt={index === 0 ? relatedProductName : ""} />
                        ))}
                      </div>
                      {hasDiscount && <span className="product-related-discount">{item.discount_percent}% off</span>}
                      {slideImages.length > 1 && (
                        <div className="product-related-dots" aria-hidden="true">
                          {slideImages.map((image, index) => (
                            <span key={`${image.url}-dot-${index}`} className={index === activeSlide ? "active" : ""} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="product-related-body">
                      <h3>{relatedProductName}</h3>
                      {item.short_description && <p className="product-related-desc">{item.short_description}</p>}
                      <div className="product-related-price">
                        <strong>{formatMoney(item.selling_price)}</strong>
                        {hasDiscount && (
                          <>
                            <span>{formatMoney(item.mrp_price)}</span>
                            <em>{item.discount_percent}% OFF</em>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {buyNowOpen && (
        <div className="buy-now-modal" role="dialog" aria-modal="true" aria-label="Buy now checkout">
          <div className={`buy-now-card ${buyNowStep === "payment" ? "is-payment" : "is-details"}`}>
            <div className="buy-now-header">
              <div>
                <span>Buy Now</span>
                <h2>Complete your order</h2>
              </div>
              <button type="button" onClick={closeBuyNowModal} aria-label="Close buy now" disabled={buyNowPlacing}>
                <Icon icon="lucide:x" />
              </button>
            </div>

            <div className="buy-now-content">
              <CheckoutOrderPanel
                step={buyNowStep === "payment" ? "review" : "details"}
                addresses={buyNowAddresses}
                selectedAddressId={selectedBuyNowAddressId}
                onSelectAddress={(address) => setSelectedBuyNowAddressId(String(address.id))}
                onAddAddress={() => openBuyNowAddressModal()}
                onEditAddress={editBuyNowAddress}
                getAddressLine={getAddressLine}
                user={user}
                addressLoading={buyNowLoading}
                emptyAddressIcon="lucide:map-pin-off"
                emptyAddressText="Add a delivery address to continue checkout."
                paymentOptions={[
                  {
                    id: "cod",
                    icon: "lucide:banknote",
                    title: "Cash on Delivery",
                    description: canUseCod ? `${formatMoney(COD_FEE_AMOUNT)} COD charge` : `Not available above ${formatMoney(COD_MAX_AMOUNT)}`,
                    active: true,
                    disabled: !canUseCod,
                    onSelect: () => {
                      if (!canUseCod) showNotification(`COD is available only up to ${formatMoney(COD_MAX_AMOUNT)}.`, "warning");
                    },
                  },
                ]}
                deliveryError={buyNowShipping?.unavailable ? (buyNowShipping.message || "Delivery is not possible at this location right now.") : null}
                proceedAction={{
                  label: buyNowShippingLoading ? "Checking delivery..." : "Proceed",
                  onClick: proceedToFinalPayment,
                  disabled: buyNowLoading || buyNowShippingLoading || !selectedBuyNowAddress || !buyNowShipping || buyNowShipping?.unavailable,
                }}
                reviewTitle="Review details"
                reviewItems={[]}
                reviewAddress={{
                  name: selectedBuyNowAddress?.name || user?.name,
                  line: getAddressLine(selectedBuyNowAddress),
                  phone: selectedBuyNowAddress?.phone || user?.phone,
                }}
                reviewPayment={{
                  title: "Cash on Delivery",
                  description: "Pay when your order is delivered.",
                }}
                onEditDetails={() => setBuyNowStep("details")}
                showSummary={buyNowStep === "payment"}
                summaryProps={{
                  title: "Order Summary",
                  items: [{
                    key: product.id,
                    image: mainImage,
                    name: productName,
                    meta: `${selectedColor?.name ? `${selectedColor.name} - ` : ""}Qty ${quantity}${selectedSku ? ` - SKU: ${selectedSku}` : ""}`,
                    total: formatMoney(buyNowSubtotal),
                  }],
                  coupons: availableCoupons,
                  appliedCoupon: appliedBuyNowCoupon,
                  couponDiscount: buyNowCouponDiscount,
                  couponCode,
                  setCouponCode,
                  couponLoading,
                  onApplyCoupon: (couponOrCode) => applyBuyNowCoupon(typeof couponOrCode === "object" ? couponOrCode?.code : couponOrCode),
                  onRemoveCoupon: removeBuyNowCoupon,
                  walletBalance,
                  useWallet,
                  setUseWallet,
                  rows: [
                    { label: "Product total", value: formatMoney(buyNowSubtotal) },
                    { label: "Free delivery charge", value: buyNowShippingLoading ? "Checking..." : buyNowShipping?.unavailable ? "Unavailable" : <><s>{formatMoney(buyNowShippingRate)}</s> Free</>, tone: "success" },
                    ...(buyNowPaymentFee > 0 ? [{ label: "COD charge", value: formatMoney(buyNowPaymentFee), tone: "accent" }] : []),
                    { label: "Platform fee", value: formatMoney(buyNowPlatformFee) },
                    ...(buyNowCouponDiscount > 0 ? [{ label: "Coupon discount", value: `-${formatMoney(buyNowCouponDiscount)}`, tone: "success" }] : []),
                    ...(walletUsableAmount > 0 ? [{ label: "Wallet used", value: `-${formatMoney(walletUsableAmount)}`, tone: "success" }] : []),
                  ],
                  deliveryPromise: buyNowShipping?.deliveryDate ? {
                    title: `Arriving ${formatDeliveryDate(buyNowShipping.deliveryDate)}`,
                    subtitle: "Free standard delivery",
                    tooltip: "This is an estimated delivery date. It may change based on courier availability and your location.",
                  } : null,
                  logistics: buyNowShipping && !buyNowShipping.unavailable ? {
                    label: "Returns & exchange available",
                    tooltip: shippingDiscountReasonCode === "first_order"
                      ? "Return and exchange are available. For your first order, delivery charge will not be deducted."
                      : `Return and exchange are available. On return, refund may deduct ${formatMoney(buyNowReturnDeliveryDeduction)} delivery charge.`,
                  } : null,
                  totalLabel: "Final amount",
                  total: buyNowTotal,
                  formatMoney,
                  action: {
                    label: buyNowPlacing ? "Processing..." : "Place Order",
                    onClick: placeBuyNowOrder,
                    disabled: buyNowLoading || buyNowShippingLoading || buyNowPlacing || !selectedBuyNowAddress || !buyNowShipping || buyNowShipping?.unavailable,
                  },
                  couponModalOpen: buyNowCouponModalOpen,
                  setCouponModalOpen: setBuyNowCouponModalOpen,
                  couponCodeOpen: buyNowCouponPanelOpen,
                  setCouponCodeOpen: setBuyNowCouponPanelOpen,
                  couponCelebration,
                }}
              />
              {false && (
              <>
              {buyNowStep === "details" ? (
                <>
              <section className="buy-now-section">
                <div className="buy-now-section-title">
                  <h3>Delivery address</h3>
                  <button type="button" onClick={() => openBuyNowAddressModal()}>
                    <Icon icon="lucide:plus" />
                    Add new
                  </button>
                </div>

                {buyNowLoading && !buyNowAddresses.length ? (
                  <p className="buy-now-muted">Loading saved addresses...</p>
                ) : buyNowAddresses.length === 0 ? (
                  <div className="buy-now-no-address">
                    <Icon icon="lucide:map-pin-off" />
                    <strong>No saved address</strong>
                    <p>Add a delivery address to continue checkout.</p>
                    <button type="button" onClick={() => openBuyNowAddressModal()}>
                      <Icon icon="lucide:plus" />
                      Add new address
                    </button>
                  </div>
                ) : (
                  <div className="buy-now-address-list">
                    {buyNowAddresses.map((address) => (
                      <label key={address.id} className={`buy-now-address ${String(selectedBuyNowAddressId) === String(address.id) ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="buy_now_address"
                          checked={String(selectedBuyNowAddressId) === String(address.id)}
                          onChange={() => setSelectedBuyNowAddressId(String(address.id))}
                        />
                        <span>
                          <strong>{address.label || "Address"} {address.is_default ? <em>Default</em> : null}</strong>
                          <small>{getAddressLine(address)}</small>
                          <small>{address.name || user?.name} • {address.phone || user?.phone}</small>
                        </span>
                        <button type="button" onClick={(event) => {
                          event.preventDefault();
                          editBuyNowAddress(address);
                        }}>
                          Edit
                        </button>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <section className="buy-now-section">
                <div className="buy-now-section-title">
                  <h3>Payment</h3>
                </div>
                <div className="buy-now-payment-grid">
                  <button
                    type="button"
                    className="active"
                    onClick={() => {
                      if (!canUseCod) showNotification(`COD is available only up to ${formatMoney(COD_MAX_AMOUNT)}.`, "warning");
                    }}
                    disabled={!canUseCod}
                  >
                    <Icon icon="lucide:banknote" />
                    <span>Cash on Delivery</span>
                    <small>{canUseCod ? `${formatMoney(COD_FEE_AMOUNT)} COD charge` : `Not available above ${formatMoney(COD_MAX_AMOUNT)}`}</small>
                  </button>
                </div>
              </section>

              {buyNowShipping?.unavailable && (
                <div className="buy-now-delivery-error" role="status">
                  <Icon icon="lucide:map-pin-off" />
                  <span>{buyNowShipping.message || "Delivery is not possible at this location right now."}</span>
                </div>
              )}

              <button
                type="button"
                className="buy-now-proceed"
                onClick={proceedToFinalPayment}
                disabled={buyNowLoading || buyNowShippingLoading || !selectedBuyNowAddress || !buyNowShipping || buyNowShipping?.unavailable}
              >
                {buyNowShippingLoading ? "Checking delivery..." : "Proceed"}
              </button>
                </>
              ) : (
                <>
              <section className="buy-now-section">
                <div className="buy-now-section-title">
                  <h3>Review details</h3>
                  <button type="button" onClick={() => setBuyNowStep("details")}>
                    <Icon icon="lucide:arrow-left" />
                    Back
                  </button>
                </div>
                <div className="buy-now-review-card">
                  <span>Deliver to</span>
                  <strong>{selectedBuyNowAddress?.name || user?.name}</strong>
                  <p>{getAddressLine(selectedBuyNowAddress)}</p>
                  <small>{selectedBuyNowAddress?.phone || user?.phone}</small>
                </div>
                <div className="buy-now-review-card">
                  <span>Payment method</span>
                  <strong>Cash on Delivery</strong>
                  <p>Pay when your order is delivered.</p>
                </div>
              </section>

              <section className="buy-now-section buy-now-final-section">
                <CheckoutReviewSummary
                  title=""
                  items={[{
                    key: product.id,
                    image: mainImage,
                    name: productName,
                    meta: `${selectedColor?.name ? `${selectedColor.name} - ` : ""}Qty ${quantity}${selectedSku ? ` - SKU: ${selectedSku}` : ""}`,
                    total: formatMoney(buyNowSubtotal),
                  }]}
                  coupons={availableCoupons}
                  appliedCoupon={appliedBuyNowCoupon}
                  couponDiscount={buyNowCouponDiscount}
                  couponCode={couponCode}
                  setCouponCode={setCouponCode}
                  couponLoading={couponLoading}
                  onApplyCoupon={(couponOrCode) => applyBuyNowCoupon(typeof couponOrCode === "object" ? couponOrCode?.code : couponOrCode)}
                  onRemoveCoupon={removeBuyNowCoupon}
                  walletBalance={walletBalance}
                  useWallet={useWallet}
                  setUseWallet={setUseWallet}
                  rows={[
                    { label: "Product total", value: formatMoney(buyNowSubtotal) },
                    { label: "Free delivery charge", value: buyNowShippingLoading ? "Checking..." : buyNowShipping?.unavailable ? "Unavailable" : <><s>{formatMoney(buyNowShippingRate)}</s> Free</>, tone: "success" },
                    ...(buyNowPaymentFee > 0 ? [{ label: "COD charge", value: formatMoney(buyNowPaymentFee), tone: "accent" }] : []),
                    { label: "Platform fee", value: formatMoney(buyNowPlatformFee) },
                    ...(buyNowCouponDiscount > 0 ? [{ label: "Coupon discount", value: `-${formatMoney(buyNowCouponDiscount)}`, tone: "success" }] : []),
                    ...(walletUsableAmount > 0 ? [{ label: "Wallet used", value: `-${formatMoney(walletUsableAmount)}`, tone: "success" }] : []),
                  ]}
                  deliveryPromise={buyNowShipping?.deliveryDate ? {
                    title: `Arriving ${formatDeliveryDate(buyNowShipping.deliveryDate)}`,
                    subtitle: "Free standard delivery",
                    tooltip: "This is an estimated delivery date. It may change based on courier availability and your location.",
                  } : null}
                  logistics={buyNowShipping && !buyNowShipping.unavailable ? {
                    label: "Returns & exchange available",
                    tooltip: shippingDiscountReasonCode === "first_order"
                      ? "Return and exchange are available. For your first order, delivery charge will not be deducted."
                      : `Return and exchange are available. On return, refund may deduct ${formatMoney(buyNowReturnDeliveryDeduction)} delivery charge.`,
                  } : null}
                  totalLabel="Final amount"
                  total={buyNowTotal}
                  formatMoney={formatMoney}
                  action={{
                    label: buyNowPlacing ? "Processing..." : "Place Order",
                    onClick: placeBuyNowOrder,
                    disabled: buyNowLoading || buyNowShippingLoading || buyNowPlacing || !selectedBuyNowAddress || !buyNowShipping || buyNowShipping?.unavailable,
                  }}
                  couponModalOpen={buyNowCouponModalOpen}
                  setCouponModalOpen={setBuyNowCouponModalOpen}
                  couponCodeOpen={buyNowCouponPanelOpen}
                  setCouponCodeOpen={setBuyNowCouponPanelOpen}
                  couponCelebration={couponCelebration}
                />
              </section>
                </>
              )}
              </>
              )}
            </div>
          </div>
          {buyNowAddressModalOpen && (
            <div className="buy-now-address-modal" role="dialog" aria-modal="true" aria-label={editingBuyNowAddressId ? "Edit address" : "Add new address"}>
              <div className="buy-now-address-modal-card">
                <button type="button" className="buy-now-address-modal-close" onClick={closeBuyNowAddressModal} aria-label="Close address form">
                  <Icon icon="lucide:x" />
                </button>
                <div className="buy-now-section-title buy-now-address-modal-title">
                  <h3>{editingBuyNowAddressId ? "Edit address" : "Add new address"}</h3>
                  <span>Required fields are marked with *.</span>
                </div>

                <div className="buy-now-location-card">
                  <div>
                    <span>Map address</span>
                    {buyNowAddressForm.map_address ? (
                      <>
                        <strong>{buyNowAddressForm.map_address}</strong>
                        <p>Saved separately from the address you type below.</p>
                      </>
                    ) : (
                      <p>No map location selected.</p>
                    )}
                  </div>
                  <div className="buy-now-location-actions">
                    <button type="button" onClick={() => setBuyNowMapOpen(true)}>
                      <Icon icon="lucide:map-pinned" />
                      {buyNowAddressForm.map_address ? "Change map location" : "Add map location"}
                    </button>
                    {buyNowAddressForm.map_address ? (
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => setBuyNowAddressForm((current) => ({ ...current, map_address: "", map_lat: "", map_lng: "" }))}
                      >
                        <Icon icon="lucide:x" />
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>

                {showBuyNowAddressForm && (
                  <div className="buy-now-address-form">
                    <div className="buy-now-form-row">
                      <label>
                        <span>Label</span>
                        <select name="label" value={buyNowAddressForm.label} onChange={handleBuyNowAddressChange}>
                          <option>Home</option>
                          <option>Work</option>
                          <option>Other</option>
                        </select>
                      </label>
                      <label>
                        <span>Receiver name</span>
                        <input name="name" value={buyNowAddressForm.name} onChange={handleBuyNowAddressChange} />
                      </label>
                    </div>
                    <label>
                      <span>Flat, House no., Building *</span>
                      <input name="house_building" value={buyNowAddressForm.house_building} onChange={handleBuyNowAddressChange} />
                    </label>
                    <label>
                      <span>Area, Street, Sector</span>
                      <input name="area_street" value={buyNowAddressForm.area_street} onChange={handleBuyNowAddressChange} />
                    </label>
                    <div className="buy-now-form-row">
                      <label>
                        <span>City *</span>
                        <input name="city" value={buyNowAddressForm.city} onChange={handleBuyNowAddressChange} />
                      </label>
                      <label>
                        <span>State *</span>
                        <input name="state" value={buyNowAddressForm.state} onChange={handleBuyNowAddressChange} />
                      </label>
                    </div>
                    <div className="buy-now-form-row">
                      <label>
                        <span>Pincode *</span>
                        <input name="pincode" inputMode="numeric" value={buyNowAddressForm.pincode} onChange={handleBuyNowAddressChange} />
                      </label>
                      <label>
                        <span>Phone *</span>
                        <input name="phone" inputMode="tel" value={buyNowAddressForm.phone} onChange={handleBuyNowAddressChange} />
                      </label>
                    </div>
                    <label>
                      <span>Landmark</span>
                      <input name="landmark" value={buyNowAddressForm.landmark} onChange={handleBuyNowAddressChange} />
                    </label>
                    <label className="buy-now-checkbox">
                      <input type="checkbox" name="is_default" checked={buyNowAddressForm.is_default} onChange={handleBuyNowAddressChange} />
                      <span>Set as default address</span>
                    </label>
                    <div className="buy-now-form-actions">
                      <button type="button" onClick={closeBuyNowAddressModal} disabled={buyNowLoading}>
                        Cancel
                      </button>
                      <button type="button" onClick={saveBuyNowAddress} disabled={buyNowLoading}>
                        {buyNowLoading ? "Saving..." : "Save address"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <LocationPickerModal
        open={buyNowMapOpen}
        initialQuery={[buyNowAddressForm.house_building, buyNowAddressForm.city, buyNowAddressForm.state].filter(Boolean).join(", ")}
        onClose={() => setBuyNowMapOpen(false)}
        onConfirm={confirmBuyNowLocation}
      />
    </div>
  );
};

export default ProductDetail;
