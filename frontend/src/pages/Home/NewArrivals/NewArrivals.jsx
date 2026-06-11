import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { imgUrl } from "../../../utils/cloudinary";
import { useAuth } from "../../../context/AuthContext";
import { useWishlist } from "../../../context/WishlistContext";
import { API_ENDPOINTS } from "../../../config/api";
import { getProductCoverImage, getProductImages } from "../../../utils/productMedia";
import { getProductStockInfo } from "../../../utils/stockStatus";
import ProductRating from "../../../components/ProductRating";
import "./NewArrivals.css";

const calcDiscount = (mrp, sell) => {
  if (!mrp || !sell || Number(mrp) <= Number(sell)) return 0;
  return Math.round(((Number(mrp) - Number(sell)) / Number(mrp)) * 100);
};

const NewArrivals = () => {
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
      newArrival: "true",
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
    const cards = sectionRef.current.querySelectorAll(".bk-arrival-card");
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

  const handleWishlistClick = (e, product, colorId) => {
    e.preventDefault();
    if (!user) { navigate("/wishlist"); return; }
    toggleWishlist(product, colorId || null);
  };

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

  return (
    <section className="bk-arrivals-section" ref={sectionRef}>
      <div className="bk-arrivals-shell">
        <div className="bk-arrivals-copy">
          <span className="bk-arrivals-kicker">Fresh Drapes</span>
          <h2>New Arrivals</h2>
          <p>Freshly added sarees, ready for the first glance and the next celebration.</p>
        </div>

        <div className="bk-arrivals-products">
          {loading ? (
            <div className="bk-arrivals-rail bk-arrivals-skeleton-rail">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="bk-arrival-card bk-arrival-skeleton">
                  <div className="bk-arrival-skeleton-image" />
                  <div className="bk-arrival-info">
                    <div className="bk-arrival-skeleton-line wide" />
                    <div className="bk-arrival-skeleton-line" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bk-arrivals-empty" role="status">
              <h3>New Arrivals Coming Soon</h3>
              <p>Once fresh active stock is marked as new arrival, it will appear here.</p>
            </div>
          ) : (
            <div className="bk-arrivals-rail">
              {products.map((product, index) => {
                const sell = Number(product.selling_price || product.price);
                const mrp = Number(product.mrp_price || product.mrp || 0);
                const disc = calcDiscount(mrp, sell);
                const cover = getProductCoverImage(product);
                const cardImages = getProductImages(product);
                const sliderImages = cardImages.length > 0 ? cardImages : [{ url: cover }];
                const activeIndex = activeSlides[product.id] || 0;
                const stockInfo = getProductStockInfo(product);
                const currentColorId = sliderImages[activeIndex]?.color_id || null;
                const liked = isInWishlist(product.id, currentColorId);

                return (
                  <article
                    key={product.id}
                    className={`bk-arrival-card${stockInfo.isOutOfStock ? " is-out-of-stock" : ""}`}
                    onMouseEnter={() => handleCardEnter(product.id)}
                    onMouseLeave={() => handleCardLeave(product.id)}
                    onFocus={() => handleCardEnter(product.id)}
                    onBlur={() => handleCardLeave(product.id)}
                    style={{ transitionDelay: `${Math.min(index * 35, 200)}ms` }}
                  >
                    <Link to={`/product/${product.slug}`} className="bk-arrival-link">
                      <div
                        className="bk-arrival-media"
                        onTouchStart={handleTouchStart}
                        onTouchEnd={(e) => handleTouchEnd(e, product.id, sliderImages.length)}
                      >
                        {(stockInfo.isOutOfStock || stockInfo.isLowStock) && (
                          <span className={`bk-home-stock-badge ${stockInfo.isOutOfStock ? "out" : "low"}`}>
                            {stockInfo.badge}
                          </span>
                        )}
                        <div
                          className="bk-arrival-track"
                          style={{
                            "--arrival-slide-count": sliderImages.length,
                            transform: `translateX(-${activeIndex * (100 / sliderImages.length)}%)`,
                          }}
                        >
                          {sliderImages.map((image, imageIndex) => (
                            <span className="bk-arrival-slide" key={`${image.url}-${imageIndex}`}>
                              <img src={imgUrl(image.url)} alt="" className="bk-arrival-image-bg" aria-hidden="true" />
                              <img src={imgUrl(image.url)} alt={product.name} className="bk-arrival-image" />
                            </span>
                          ))}
                        </div>
                        {sliderImages.length > 1 && (
                          <div className="bk-arrival-dots" aria-hidden="true">
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
                          className="bk-arrival-wishlist"
                          aria-label={liked ? "Remove from wishlist" : "Add to wishlist"}
                        >
                          <svg width="20" height="20" fill={liked ? "#800020" : "none"} stroke={liked ? "#800020" : "#fff"} strokeWidth="1.8" viewBox="0 0 24 24">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                          </svg>
                        </button>
                      </div>

                      <div className="bk-arrival-info">
                        <h3>{product.name}</h3>
                        <div className="bk-arrival-price-row">
                          {stockInfo.isOutOfStock ? (
                            <span className="bk-arrival-oos-stack">
                              {mrp > 0 && <span className="bk-arrival-price">Rs. {mrp.toLocaleString("en-IN")}</span>}
                              <span className="bk-arrival-oos-label">Out of Stock</span>
                            </span>
                          ) : (
                            <>
                              <span className="bk-arrival-price">Rs. {sell.toLocaleString("en-IN")}</span>
                              {mrp > sell && <span className="bk-arrival-mrp">Rs. {mrp.toLocaleString("en-IN")}</span>}
                              {disc > 0 && <span className="bk-arrival-discount">{disc}% OFF</span>}
                            </>
                          )}
                        </div>
                        <ProductRating product={product} className="bk-arrival-rating" />
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}

          <div className="bk-arrivals-footer">
            <Link to="/collection" className="bk-arrivals-link">
              View Collection
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NewArrivals;
