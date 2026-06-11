import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { imgUrl } from "../../../utils/cloudinary";
import { useAuth } from "../../../context/AuthContext";
import { useWishlist } from "../../../context/WishlistContext";
import { API_ENDPOINTS } from "../../../config/api";
import { getProductCoverImage, getProductImages } from "../../../utils/productMedia";
import { getProductStockInfo } from "../../../utils/stockStatus";
import ProductRating from "../../../components/ProductRating";
import "./PopularSarees.css";

const calcDiscount = (mrp, sell) => {
  if (!mrp || !sell || Number(mrp) <= Number(sell)) return 0;
  return Math.round(((Number(mrp) - Number(sell)) / Number(mrp)) * 100);
};

const PopularSarees = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const sectionRef = useRef(null);
  const touchStartX = useRef(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredProductId, setHoveredProductId] = useState(null);
  const [activeSlides, setActiveSlides] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      status: "active",
      storeFrontVisibility: "true",
      limit: "10",
      view: "home",
    });
    fetch(`${API_ENDPOINTS.products}?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setProducts((data.items || data).slice(0, 10)))
      .catch((err) => { if (err.name !== "AbortError") setProducts([]); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (loading || products.length === 0 || !sectionRef.current) return undefined;
    const cards = sectionRef.current.querySelectorAll(".bk-popular-card");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.01, rootMargin: "0px 0px 220px 0px" }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [loading, products]);

  // Slideshow on hover — desktop only (triggered by onMouseEnter)
  useEffect(() => {
    if (!hoveredProductId) return undefined;
    const product = products.find((item) => item.id === hoveredProductId);
    const imageCount = getProductImages(product || {}).length;
    if (imageCount <= 1) return undefined;
    const advanceSlide = () => {
      setActiveSlides((current) => ({
        ...current,
        [hoveredProductId]: ((current[hoveredProductId] || 0) + 1) % imageCount,
      }));
    };
    const startTimer = window.setTimeout(advanceSlide, 400);
    const timer = window.setInterval(advanceSlide, 1800);
    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(timer);
    };
  }, [hoveredProductId, products]);

  const handleCardEnter = (productId) => setHoveredProductId(productId);
  const handleCardLeave = (productId) => {
    setHoveredProductId((current) => (current === productId ? null : current));
    setActiveSlides((current) => ({ ...current, [productId]: 0 }));
  };

  // Swipe to change image on mobile
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e, productId, imageCount) => {
    if (touchStartX.current === null || imageCount <= 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    setActiveSlides((prev) => {
      const idx = prev[productId] || 0;
      const next = dx < 0
        ? (idx + 1) % imageCount
        : (idx - 1 + imageCount) % imageCount;
      return { ...prev, [productId]: next };
    });
  };

  const handleWishlistClick = (e, product, colorId) => {
    e.preventDefault();
    if (!user) { navigate("/wishlist"); return; }
    toggleWishlist(product, colorId || null);
  };

  return (
    <section className="bk-popular-section" ref={sectionRef}>
      <div className="bk-popular-shell">
        <div className="bk-popular-header">
          <div className="bk-popular-title-wrap">
            <h2>Exclusive Picks</h2>
          </div>
        </div>

        {loading ? (
          <div className="bk-popular-showcase bk-popular-skeleton-grid">
            {[...Array(10)].map((_, i) => (
              <div key={i} className={`bk-popular-card bk-popular-skeleton ${i === 0 ? "bk-popular-feature-card" : ""}`}>
                <div className="bk-popular-skeleton-image" />
                <div className="bk-popular-card-body">
                  <div className="bk-popular-skeleton-line wide" />
                  <div className="bk-popular-skeleton-line" />
                  <div className="bk-popular-skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bk-popular-empty" role="status">
            <div className="bk-popular-empty-icon" aria-hidden="true" />
            <h3>Curating Exclusive Picks</h3>
            <p>Featured pieces will appear here as soon as the collection is ready.</p>
            <Link to="/collection" className="bk-popular-empty-link">Explore Collection</Link>
          </div>
        ) : (
          <div className="bk-popular-showcase">
            {products.slice(0, 10).map((product, index) => {
              const sell = Number(product.selling_price);
              const mrp = Number(product.mrp_price);
              const disc = calcDiscount(mrp, sell);
              const img = getProductCoverImage(product);
              const cardImages = getProductImages(product);
              const sliderImages = cardImages.length > 0 ? cardImages : [{ url: img }];
              const activeIndex = activeSlides[product.id] || 0;
              const currentColorId = sliderImages[activeIndex]?.color_id || null;
              const liked = isInWishlist(product.id, currentColorId);
              const stockInfo = getProductStockInfo(product);
              const motionClass = index % 3 === 0 ? "from-left" : index % 3 === 1 ? "from-bottom" : "from-right";

              return (
                <article
                  key={product.id}
                  className={`bk-popular-card ${motionClass}${stockInfo.isOutOfStock ? " is-out-of-stock" : ""}`}
                  onMouseEnter={() => handleCardEnter(product.id)}
                  onMouseLeave={() => handleCardLeave(product.id)}
                  onFocus={() => handleCardEnter(product.id)}
                  onBlur={() => handleCardLeave(product.id)}
                  style={{ transitionDelay: `${Math.min(index * 40, 200)}ms` }}
                >
                  <Link to={`/product/${product.slug}`} className="bk-popular-card-link">
                    <div
                      className="bk-popular-image-wrap"
                      onTouchStart={handleTouchStart}
                      onTouchEnd={(e) => handleTouchEnd(e, product.id, sliderImages.length)}
                    >
                      {(stockInfo.isOutOfStock || stockInfo.isLowStock) && (
                        <span className={`bk-home-stock-badge ${stockInfo.isOutOfStock ? "out" : "low"}`}>
                          {stockInfo.badge}
                        </span>
                      )}
                      <div
                        className="bk-popular-image-track"
                        style={{
                          "--slide-count": sliderImages.length,
                          transform: `translateX(-${activeIndex * (100 / sliderImages.length)}%)`,
                        }}
                      >
                        {sliderImages.map((image, imageIndex) => (
                          <span key={`${image.url}-${imageIndex}`} className="bk-popular-slide">
                            <img src={imgUrl(image.url)} alt="" className="bk-popular-image-bg" aria-hidden="true" />
                            <img src={imgUrl(image.url)} alt={product.name} className="bk-popular-image" />
                          </span>
                        ))}
                      </div>
                      {sliderImages.length > 1 && (
                        <div className="bk-popular-dots" aria-hidden="true">
                          {sliderImages.map((image, dotIndex) => (
                            <span
                              key={`${image.url}-dot-${dotIndex}`}
                              className={dotIndex === activeIndex ? "is-active" : ""}
                            />
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleWishlistClick(e, product, currentColorId)}
                        className="bk-popular-wishlist"
                        aria-label={liked ? "Remove from wishlist" : "Add to wishlist"}
                      >
                        <svg width="23" height="23" fill={liked ? "#800020" : "none"} stroke={liked ? "#800020" : "#fff"} strokeWidth="1.8" viewBox="0 0 24 24">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </button>
                    </div>

                    <div className="bk-popular-card-body">
                      <h3>{product.name}</h3>
                      <div className="bk-popular-price-row">
                        {stockInfo.isOutOfStock ? (
                          <span className="bk-popular-oos-stack">
                            {mrp > 0 && <span className="bk-popular-price">Rs. {mrp.toLocaleString("en-IN")}</span>}
                            <span className="bk-popular-oos-label">Out of Stock</span>
                          </span>
                        ) : (
                          <>
                            <span className="bk-popular-price">Rs. {sell.toLocaleString("en-IN")}</span>
                            {mrp > sell && <span className="bk-popular-mrp">Rs. {mrp.toLocaleString("en-IN")}</span>}
                            {disc > 0 && <span className="bk-popular-discount">{disc}% OFF</span>}
                          </>
                        )}
                      </div>
                      <ProductRating product={product} className="bk-popular-rating" />
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="bk-popular-footer">
            <Link to="/collection" className="bk-popular-view-all">
              View All
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default PopularSarees;
