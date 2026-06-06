import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../utils/api';
import { API_ENDPOINTS } from '../config/api';
import { useNotification } from './NotificationContext';
import { getProductCoverImage, getProductImages } from '../utils/productMedia';
import { unwrapApiData } from '../utils/error';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const { showNotification } = useNotification();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  // Coupon States shared across Bag and Checkout
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [discountAmount, setDiscountAmount] = useState(0);

  const fetchAndSetCart = useCallback(async () => {
    if (!user) return [];
    const res = await api.get(API_ENDPOINTS.cart);
    const payload = unwrapApiData(res.data);
    const rawItems = Array.isArray(payload) ? payload : [];
    const formatted = rawItems.map(item => {
      const product = item.Product;
      if (!product) return null;
      const price = product.selling_price || product.mrp_price || 0;
      const allImages = getProductImages(product);
      const colorImage = allImages.find(img => img.color_id === item.colorId);
      const image_url = colorImage?.url || getProductCoverImage(product);
      return {
        ...product,
        cartItemId: item.id,
        quantity: item.quantity,
        colorId: item.colorId,
        selectedColorName: item.Color?.name || "",
        selectedColorSlug: item.Color?.slug || "",
        selectedColorHex: item.Color?.hex_code || "",
        price,
        image_url
      };
    }).filter(Boolean);
    setCart(formatted);
    return formatted;
  }, [user]);

  // Load cart from backend when user changes
  useEffect(() => {
    if (authLoading) return; // wait for auth to resolve before acting
    if (user) {
      setLoading(true);
      fetchAndSetCart()
        .catch(err => console.error("Error fetching cart:", err))
        .finally(() => setLoading(false));
    } else {
      setCart([]);
      setAppliedCoupon(null);
      setDiscountAmount(0);
      setLoading(false);
    }
  }, [user, authLoading, fetchAndSetCart]);

  const refreshCart = useCallback(() => {
    return fetchAndSetCart().catch(err => console.error("Error refreshing cart:", err));
  }, [fetchAndSetCart]);

  const addToCart = async (product, quantity = 1, colorId = null) => {
    if (!user) return { success: false, message: "Please login to add items to bag." };
    if (!product) return { success: false, message: "Product not found." };

    const snapshot = cart;
    const existing = cart.find(
      item => Number(item.id) === Number(product.id) && String(item.colorId) === String(colorId)
    );

    if (existing) {
      setCart(prev => prev.map(item =>
        Number(item.id) === Number(product.id) && String(item.colorId) === String(colorId)
          ? { ...item, quantity: item.quantity + quantity }
          : item
      ));
    } else {
      const allImages = getProductImages(product);
      const colorImage = allImages.find(img => String(img.color_id) === String(colorId));
      const colorInfo = Array.isArray(product.colors)
        ? product.colors.find(c => String(c.id) === String(colorId))
        : null;
      setCart(prev => [...prev, {
        ...product,
        cartItemId: null,
        quantity,
        colorId,
        selectedColorName: colorInfo?.name || "",
        selectedColorSlug: colorInfo?.slug || "",
        selectedColorHex: colorInfo?.hex_code || "",
        price: product.selling_price || product.mrp_price || 0,
        image_url: colorImage?.url || getProductCoverImage(product),
      }]);
    }

    try {
      await api.post(API_ENDPOINTS.cart, { productId: product.id, quantity, colorId });
      // Sync real cartItemId in background — don't await
      fetchAndSetCart().catch(() => {});
      return { success: true };
    } catch (error) {
      setCart(snapshot);
      return { success: false, message: error.response?.data?.message || "Failed to add to bag" };
    }
  };

  const removeFromCart = async (productId, colorId = null) => {
    if (!user) return;
    const snapshot = cart;
    setCart(prev => prev.filter(item => !(item.id === productId && item.colorId === colorId)));
    try {
      await api.delete(`${API_ENDPOINTS.cart}/${productId}`, { params: { colorId } });
    } catch {
      setCart(snapshot);
    }
  };

  const updateQuantity = async (productId, quantity, colorId = null) => {
    if (!user || quantity < 1) return;
    const snapshot = cart;
    setCart(prev => prev.map(item =>
      item.id === productId && String(item.colorId) === String(colorId)
        ? { ...item, quantity }
        : item
    ));
    try {
      await api.put(`${API_ENDPOINTS.cart}/quantity`, { productId, quantity, colorId });
      return { success: true };
    } catch (error) {
      setCart(snapshot);
      const msg = error.response?.data?.message || "Update failed";
      return { success: false, message: msg };
    }
  };

  const clearCart = async () => {
    if (!user) return;
    try {
      setCart([]);
      setAppliedCoupon(null);
      setDiscountAmount(0);
      await api.delete(API_ENDPOINTS.cart);
    } catch (error) {
      console.error("Error clearing cart:", error);
    }
  };

  const getSubtotal = useCallback(() => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [cart]);

  // Coupon Validation Logic moved to Context
  const applyCoupon = useCallback((coupon) => {
    const currentSubtotal = getSubtotal();
    
    // 1. Min Purchase Check
    if (currentSubtotal < Number(coupon.min_purchase_amount)) {
      showNotification(`Add Rs. ${(Number(coupon.min_purchase_amount) - currentSubtotal).toLocaleString("en-IN")} more to use this coupon.`, "info");
      return false;
    }

    // 2. Applicability Check
    let applicableSubtotal = 0;
    const hasRestrictions = coupon.applicable_product_id?.length || 
                           coupon.applicable_variety_id?.length;

    if (!hasRestrictions) {
      applicableSubtotal = currentSubtotal;
    } else {
      cart.forEach(item => {
        let isMatch = false;
        if (coupon.applicable_product_id?.includes(item.id)) isMatch = true;
        if (coupon.applicable_variety_id?.includes(item.variety_id)) isMatch = true;
        
        if (isMatch) applicableSubtotal += (item.price * item.quantity);
      });
    }

    if (applicableSubtotal === 0 && hasRestrictions) {
      showNotification("This coupon is not valid for the items in your bag.", "warning");
      return false;
    }

    // 3. Calculate Discount
    let discount;
    if (coupon.discount_type === "percentage") {
      discount = (applicableSubtotal * Number(coupon.discount_percent)) / 100;
      if (coupon.max_discount_amount && discount > Number(coupon.max_discount_amount)) {
        discount = Number(coupon.max_discount_amount);
      }
    } else {
      discount = Number(coupon.discount_amount);
    }

    setDiscountAmount(discount);
    setAppliedCoupon(coupon);
    showNotification(`Coupon ${coupon.code} applied. You saved Rs. ${discount.toLocaleString("en-IN")}.`, "success");
    return true;
  }, [cart, getSubtotal, showNotification]);

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setDiscountAmount(0);
    showNotification("Coupon removed", "info");
  };

  const getCartCount = useCallback(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  return (
    <CartContext.Provider value={{
      cart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      refreshCart,
      getSubtotal,
      getCartCount,
      appliedCoupon,
      discountAmount,
      applyCoupon,
      removeCoupon,
      loading
    }}>
      {children}
    </CartContext.Provider>
  );
};
