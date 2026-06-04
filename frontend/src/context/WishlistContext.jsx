import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import api from '../utils/api';
import { useNotification } from './NotificationContext';
import { API_ENDPOINTS } from '../config/api';
import { getProductCoverImage, getProductImages } from '../utils/productMedia';

const WishlistContext = createContext();

const getWishlistRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.wishlist)) return payload.wishlist;
  return [];
};

const formatWishlist = (payload) =>
  getWishlistRows(payload)
    .filter(item => item?.Product)
    .map(item => {
      const product = item.Product;
      const color = item.Color || null;
      const colorId = item.colorId ?? null;

      const allImages = getProductImages(product);
      const colorImage = colorId
        ? allImages.find(img => String(img.color_id) === String(colorId))
        : null;

      return {
        ...product,
        wishlistItemId: item.id,
        colorId,
        colorName: color?.name || null,
        colorHex: color?.hex_code || null,
        colorSlug: color?.slug || null,
        price: product.selling_price || product.mrp_price || 0,
        image_url: colorImage?.url || getProductCoverImage(product),
      };
    });

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used within a WishlistProvider');
  return context;
};

export const WishlistProvider = ({ children }) => {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingKeys, setProcessingKeys] = useState(new Set());

  const refreshWishlist = () =>
    api.get(API_ENDPOINTS.wishlist)
      .then(res => setWishlist(formatWishlist(res.data)))
      .catch(() => {}); // keep optimistic state on refresh failure

  useEffect(() => {
    if (!user) { setWishlist([]); return; }
    setLoading(true);
    api.get(API_ENDPOINTS.wishlist)
      .then(res => setWishlist(formatWishlist(res.data)))
      .catch(err => console.error("Error fetching wishlist:", err))
      .finally(() => setLoading(false));
  }, [user]);

  const getKey = (productId, colorId) => `${productId}-${colorId ?? "none"}`;

  const isInWishlist = (productId, colorId = null) =>
    wishlist.some(
      item =>
        Number(item.id) === Number(productId) &&
        String(item.colorId ?? "none") === String(colorId ?? "none")
    );

  const toggleWishlist = async (product, colorId = null) => {
    if (!user || !product) return false;

    const pId = Number(product.id);
    const cId = colorId ? Number(colorId) : null;
    const key = getKey(pId, cId);
    if (processingKeys.has(key)) return false;

    setProcessingKeys(prev => new Set(prev).add(key));

    const currentlyIn = isInWishlist(pId, cId);
    const isAdded = !currentlyIn;

    // 1. Optimistic update
    if (currentlyIn) {
      setWishlist(prev =>
        prev.filter(item =>
          !(Number(item.id) === pId && String(item.colorId ?? "none") === String(cId ?? "none"))
        )
      );
    } else {
      const allImages = getProductImages(product);
      const colorImage = cId
        ? allImages.find(img => String(img.color_id) === String(cId))
        : null;
      setWishlist(prev => [...prev, {
        ...product,
        wishlistItemId: null,
        colorId: cId,
        colorName: null,
        colorHex: null,
        price: product.selling_price || product.mrp_price || product.price || 0,
        image_url: colorImage?.url || getProductCoverImage(product) || product.image_url || "",
      }]);
    }

    // 2. Toast fires immediately
    showNotification(isAdded ? "Added to wishlist!" : "Removed from wishlist!");

    // 3. API call — only revert if THIS call fails, not the refresh
    try {
      await api.post(`${API_ENDPOINTS.wishlist}/toggle`, { productId: pId, colorId: cId });
    } catch (error) {
      console.error("Error toggling wishlist:", error);
      // Revert the optimistic update
      if (currentlyIn) {
        const allImages = getProductImages(product);
        const colorImage = cId
          ? allImages.find(img => String(img.color_id) === String(cId))
          : null;
        setWishlist(prev => [...prev, {
          ...product,
          wishlistItemId: null,
          colorId: cId,
          price: product.selling_price || product.mrp_price || product.price || 0,
          image_url: colorImage?.url || getProductCoverImage(product) || product.image_url || "",
        }]);
      } else {
        setWishlist(prev =>
          prev.filter(item =>
            !(Number(item.id) === pId && String(item.colorId ?? "none") === String(cId ?? "none"))
          )
        );
      }
      showNotification("Failed to update wishlist", "error");
      setProcessingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      return false;
    }

    setProcessingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });

    // 4. Refresh in background — never revert on failure
    refreshWishlist();
    return isAdded;
  };

  const removeFromWishlist = async (wishlistItemId) => {
    if (!user) return { success: false };
    setWishlist(prev => prev.filter(item => item.wishlistItemId !== wishlistItemId));
    try {
      await api.delete(`${API_ENDPOINTS.wishlist}/${wishlistItemId}`);
      showNotification("Removed from wishlist!");
      return { success: true };
    } catch (error) {
      console.error("Error removing from wishlist:", error);
      refreshWishlist(); // restore state from server
      showNotification("Failed to remove from wishlist", "error");
      return { success: false };
    }
  };

  const getWishlistCount = () => wishlist.length;

  return (
    <WishlistContext.Provider value={{
      wishlist,
      toggleWishlist,
      removeFromWishlist,
      isInWishlist,
      getWishlistCount,
      loading,
    }}>
      {children}
    </WishlistContext.Provider>
  );
};
