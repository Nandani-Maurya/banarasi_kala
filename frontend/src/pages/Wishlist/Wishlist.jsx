import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useNotification } from "../../context/NotificationContext";
import { useWishlist } from "../../context/WishlistContext";
import { API_ENDPOINTS } from "../../config/api";
import api from "../../utils/api";
import { getColorStock, getProductImages } from "../../utils/productMedia";
import EmptyStateIcon from "../../components/EmptyStateIcon";
import "./Wishlist.css";

const Wishlist = () => {
  const { wishlist, removeFromWishlist, loading } = useWishlist();
  const { addToCart } = useCart();
  const { showNotification } = useNotification();
  const [colors, setColors] = useState([]);
  const [colorModalProduct, setColorModalProduct] = useState(null);
  const [selectedColorId, setSelectedColorId] = useState(null);
  const [addingToBag, setAddingToBag] = useState(false);
  const hasItems = wishlist.length > 0;

  useEffect(() => {
    const fetchColors = async () => {
      try {
        const res = await api.get(API_ENDPOINTS.colors);
        setColors(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error("Error fetching colors:", error);
      }
    };

    fetchColors();
  }, []);

  const colorMap = useMemo(() => {
    return colors.reduce((map, color) => {
      map[Number(color.id)] = color;
      return map;
    }, {});
  }, [colors]);

  const getAvailableColors = (product) => {
    const colorIds = [
      ...new Set(
        getProductImages(product)
          .map((image) => Number(image.color_id))
          .filter(Boolean),
      ),
    ];

    return colorIds
      .map((colorId) => ({
        id: colorId,
        stock: Number(getColorStock(product, colorId) || 0),
        ...(colorMap[colorId] || { name: `Color ${colorId}`, hex_code: "#d8b46a" }),
      }))
      .filter((color) => color.id);
  };

  const openColorModal = (product) => {
    const colorOptions = getAvailableColors(product);
    const inStockColors = colorOptions.filter((color) => color.stock > 0);
    if (!inStockColors.length) {
      showNotification("This saree is currently out of stock", "warning");
      return;
    }

    setColorModalProduct(product);
    setSelectedColorId(inStockColors[0].id);
  };

  const closeColorModal = () => {
    if (addingToBag) return;
    setColorModalProduct(null);
    setSelectedColorId(null);
  };

  const handleAddToBag = async () => {
    if (!colorModalProduct || !selectedColorId) {
      showNotification("Please choose a color first", "warning");
      return;
    }

    setAddingToBag(true);
    const result = await addToCart(colorModalProduct, 1, selectedColorId);
    setAddingToBag(false);

    if (result?.success) {
      showNotification("Added to bag!");
      setColorModalProduct(null);
      setSelectedColorId(null);
    } else {
      showNotification(result?.message || "Failed to add to bag", "error");
    }
  };

  const modalColors = colorModalProduct ? getAvailableColors(colorModalProduct) : [];

  return (
    <main className="wishlist-page">
      <section className="wishlist-hero">
        <div>
          <span className="wishlist-kicker">Saved Collection</span>
          <h1>Wishlist</h1>
          <p>Your favourite Banarasi sarees, kept together for the next perfect pick.</p>
        </div>
        <div className="wishlist-hero-count">
          <strong>{wishlist.length}</strong>
          <span>{wishlist.length === 1 ? "Saree saved" : "Sarees saved"}</span>
        </div>
      </section>

      {loading ? (
        <section className="wishlist-grid" aria-label="Loading wishlist products">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="wishlist-card wishlist-card-skeleton">
              <div className="wishlist-skeleton-image" />
              <div className="wishlist-card-body">
                <span className="wishlist-skeleton-line title" />
                <span className="wishlist-skeleton-line price" />
                <span className="wishlist-skeleton-line text" />
                <span className="wishlist-skeleton-button" />
              </div>
            </article>
          ))}
        </section>
      ) : !hasItems ? (
        <section className="wishlist-empty">
          <EmptyStateIcon variant="wishlist" />
          <h2>Your wishlist is waiting</h2>
          <p>Save sarees you love and return here whenever you are ready.</p>
          <Link to="/collection" className="wishlist-primary-link">
            Explore Sarees
            <Icon icon="lucide:arrow-right" />
          </Link>
        </section>
      ) : (
        <section className="wishlist-grid" aria-label="Saved wishlist products">
          {wishlist.map((item) => {
            const price = Number(item.price || item.selling_price || 0);
            const mrp = Number(item.mrp_price || item.mrp || 0);
            const hasDiscount = mrp > price && price > 0;
            const discountPercent = Number(item.discount_percent || Math.round(((mrp - price) / mrp) * 100) || 0);
            const stockQuantity = Number(item.stock_quantity ?? 0);
            const lowStockThreshold = Number(item.low_stock_threshold || 5);
            const isOutOfStock = item.status !== "active" || stockQuantity <= 0;
            const isLowStock = !isOutOfStock && stockQuantity <= lowStockThreshold;

            return (
              <article key={item.id} className={`wishlist-card ${isOutOfStock ? "out-of-stock" : ""}`}>
                <Link to={`/product/${item.slug}`} className="wishlist-card-image">
                  <img src={item.image_url} alt={item.name} loading="lazy" />
                  {hasDiscount && discountPercent > 0 && (
                    <span className="wishlist-discount-badge">{discountPercent}% off</span>
                  )}
                  {isOutOfStock && <span className="wishlist-stock-badge">Out of stock</span>}
                  {isLowStock && <span className="wishlist-stock-badge low">Few stocks available</span>}
                </Link>
                <button
                  type="button"
                  className="wishlist-remove-icon"
                  onClick={() => removeFromWishlist(item.id)}
                  aria-label={`Remove ${item.name} from wishlist`}
                >
                  <Icon icon="lucide:x" />
                  <span>Remove</span>
                </button>

                <div className="wishlist-card-body">
                  <Link to={`/product/${item.slug}`} className="wishlist-card-title">
                    {item.name}
                  </Link>
                  <div className="wishlist-card-price">
                    <strong>Rs. {price.toLocaleString("en-IN")}</strong>
                    {hasDiscount && <span>Rs. {mrp.toLocaleString("en-IN")}</span>}
                  </div>
                  <div className="wishlist-card-actions">
                    <button
                      type="button"
                      onClick={() => openColorModal(item)}
                      disabled={isOutOfStock}
                    >
                      <Icon icon={isOutOfStock ? "lucide:bell" : "lucide:shopping-bag"} />
                      {isOutOfStock ? "Unavailable" : "Add to Bag"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {hasItems && (
        <section className="wishlist-bottom-cta">
          <div>
            <span>Still exploring?</span>
            <p>Discover more handpicked Banarasi sarees for your wardrobe.</p>
          </div>
          <Link to="/collection" className="wishlist-primary-link">
            Continue Shopping
            <Icon icon="lucide:arrow-right" />
          </Link>
        </section>
      )}

      {colorModalProduct && (
        <div className="wishlist-modal-backdrop" role="presentation" onClick={closeColorModal}>
          <section
            className="wishlist-color-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wishlist-color-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="wishlist-modal-close"
              onClick={closeColorModal}
              aria-label="Close color selection"
            >
              <Icon icon="lucide:x" />
            </button>

            <div className="wishlist-modal-product">
              <img src={colorModalProduct.image_url} alt={colorModalProduct.name} />
              <div>
                <span>Choose Color</span>
                <h2 id="wishlist-color-title">{colorModalProduct.name}</h2>
                <p>Select an available color before adding this saree to your bag.</p>
              </div>
            </div>

            <div className="wishlist-color-options">
              {modalColors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  className={`${selectedColorId === color.id ? "active" : ""} ${color.stock <= 0 ? "disabled" : ""}`}
                  onClick={() => color.stock > 0 && setSelectedColorId(color.id)}
                  disabled={color.stock <= 0}
                >
                  <span style={{ backgroundColor: color.hex_code || "#d8b46a" }} />
                  <strong>{color.name}</strong>
                  <small className={color.stock <= 0 ? "stock-out" : color.stock <= Number(colorModalProduct.low_stock_threshold || 5) ? "stock-low" : ""}>
                    {color.stock <= 0
                      ? "This color is out of stock"
                      : color.stock <= Number(colorModalProduct.low_stock_threshold || 5)
                        ? "Few stocks available"
                        : "Available"}
                  </small>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="wishlist-modal-add"
              onClick={handleAddToBag}
              disabled={addingToBag}
            >
              <Icon icon="lucide:shopping-bag" />
              {addingToBag ? "Adding..." : "Add to Bag"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
};

export default Wishlist;
