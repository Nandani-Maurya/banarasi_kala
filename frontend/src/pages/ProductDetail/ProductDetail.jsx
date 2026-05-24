import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useNotification } from "../../context/NotificationContext";
import { useWishlist } from "../../context/WishlistContext";
import { API_ENDPOINTS } from "../../config/api";
import { getProductCoverImage, getProductImages } from "../../utils/productMedia";
import "./ProductDetail.css";

const PRODUCT_RATING = "4.8";
const PRODUCT_REVIEW_COUNT = "124";

const ProductDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { addToCart } = useCart();
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
  const selectedStockStatus = selectedColor?.stock_status || "in_stock";
  const isSelectedOutOfStock = selectedStockStatus === "out_of_stock";
  const isSelectedLowStock = selectedStockStatus === "low_stock";
  const isChangingColor = Boolean(loadingColorId);
  const canAddToBag = !isSelectedOutOfStock && !isChangingColor;
  const formatMoney = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
  const productName = product?.name || "";
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
          String(color.id) === String(colorId) ? { ...color, stock_status: data.stock_status } : color,
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

  const incrementQty = () => setQuantity((prev) => prev + 1);
  const decrementQty = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const handleAddToCart = async () => {
    if (!user) {
      showNotification("Please login first", "info");
      navigate("/cart");
      return;
    }

    if (isSelectedOutOfStock) {
      showNotification("This color is out of stock.", "warning");
      return;
    }

    const result = await addToCart(product, quantity, selectedColorId);
    showNotification(result.success ? "Added to Bag!" : result.message, result.success ? "success" : "warning");
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
    const clean = deliveryPincode.trim();
    if (!/^\d{6}$/.test(clean)) {
      showNotification("Enter valid 6 digit pincode", "warning");
      return;
    }
    try {
      setDeliveryCheckLoading(true);
      setDeliveryQuote(null);
      const rawWeight = Number(product?.weight);
      const weightKg = Number.isFinite(rawWeight) && rawWeight > 0 ? (rawWeight > 5 ? rawWeight / 1000 : rawWeight) : 0.5;
      const response = await fetch(
        `${API_ENDPOINTS.shiprocket}/serviceability?pincode=${encodeURIComponent(clean)}&weight=${Math.max(0.1, Number(weightKg.toFixed(3)))}&is_cod=${Array.isArray(product?.payment_options) && product.payment_options.includes("cod") ? 1 : 0}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Unable to check delivery");

      const couriers = data?.data?.available_courier_companies || [];
      const options = couriers
        .map((c) => ({
          rate: Number(c?.rate ?? c?.freight_charge ?? c?.courier_charge),
          etd: c?.etd || c?.estimated_delivery_days || null,
          courier: c?.courier_name || "Courier",
        }))
        .filter((c) => Number.isFinite(c.rate) && c.rate >= 0);

      if (!options.length) {
        setDeliveryQuote({ unavailable: true });
        return;
      }
      options.sort((a, b) => a.rate - b.rate);
      setDeliveryQuote(options[0]);
    } catch (error) {
      showNotification(error.message || "Unable to check delivery", "warning");
      setDeliveryQuote({ unavailable: true });
    } finally {
      setDeliveryCheckLoading(false);
    }
  };

  const specificationRows = product
    ? [
        ["SKU", product.sku],
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
        Array.isArray(product.payment_options) && product.payment_options.includes("prepaid")
          ? ["Prepaid", "Online payment available"]
          : null,
        Array.isArray(product.payment_options) && product.payment_options.includes("cod")
          ? ["COD", "Cash on Delivery available on selected pin codes"]
          : null,
        Array.isArray(product.service_options) && product.service_options.includes("return")
          ? ["Return", "Return available as per policy"]
          : null,
        Array.isArray(product.service_options) && product.service_options.includes("exchange")
          ? ["Exchange", "Exchange available as per policy"]
          : null,
        ["Taxes & Shipping", "Incl. of all taxes & free shipping across Pan India"],
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

            <div className="product-thumbs">
              {visibleImages.map((image, index) => (
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
              <p>Incl. of all taxes & free shipping across Pan India</p>
            </div>

            {distinctColors.length > 0 && (
              <div className="product-color-section">
                <p>
                  Select Color: <span>{selectedColor?.name || "Choose color"}</span>
                </p>
                <div className="product-color-list">
                  {distinctColors.map((color) => {
                    const isOut = color.stock_status === "out_of_stock";
                    const isLow = color.stock_status === "low_stock";
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
                        {isLow && <small>Few stocks</small>}
                        {isOut && <small>Out</small>}
                      </button>
                    );
                  })}
                </div>
                {isSelectedLowStock && (
                  <div className="product-stock-note low">Few stocks available for this color</div>
                )}
                {isSelectedOutOfStock && (
                  <div className="product-stock-note out">This color is out of stock</div>
                )}
              </div>
            )}

            <div className="product-action-panel">
              <div className="product-qty">
                <button type="button" onClick={decrementQty} disabled={isSelectedOutOfStock} aria-label="Decrease quantity">
                  <Icon icon="lucide:minus" />
                </button>
                <input type="number" value={quantity} readOnly aria-label="Quantity" />
                <button type="button" onClick={incrementQty} disabled={isSelectedOutOfStock} aria-label="Increase quantity">
                  <Icon icon="lucide:plus" />
                </button>
              </div>
              <button type="button" onClick={handleAddToCart} className="product-add-btn" disabled={!canAddToBag}>
                <Icon icon="lucide:shopping-bag" />
                {isSelectedOutOfStock ? "Out of Stock" : isChangingColor ? "Loading..." : "Add to Bag"}
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
                      <div className="product-delivery-check">
                        <div className="product-delivery-input-row">
                          <input
                            type="text"
                            maxLength={6}
                            inputMode="numeric"
                            placeholder="Enter pincode"
                            value={deliveryPincode}
                            onChange={(e) => setDeliveryPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          />
                          <button type="button" onClick={checkDelivery} disabled={deliveryCheckLoading}>
                            {deliveryCheckLoading ? "Checking..." : "Check"}
                          </button>
                        </div>
                        {deliveryQuote?.unavailable ? (
                          <p className="product-delivery-note">Delivery details unavailable for this pincode.</p>
                        ) : deliveryQuote ? (
                          <div className="product-delivery-note">
                            <p>Delivery Fee: <strong>₹{Number(deliveryQuote.rate).toLocaleString("en-IN")}</strong></p>
                            <p>Estimated Delivery: <strong>{deliveryQuote.etd || "Will be confirmed at checkout"}</strong></p>
                            <p>Courier: <strong>{deliveryQuote.courier}</strong></p>
                          </div>
                        ) : null}
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
    </div>
  );
};

export default ProductDetail;
