import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_ENDPOINTS } from "../../../config/api";
import { getProductCoverImage, getProductImages } from "../../../utils/productMedia";
import "./NewArrivals.css";

const calcDiscount = (mrp, sell) => {
  if (!mrp || !sell || Number(mrp) <= Number(sell)) return 0;
  return Math.round(((Number(mrp) - Number(sell)) / Number(mrp)) * 100);
};

const NewArrivals = () => {
  const sectionRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasRequested, setHasRequested] = useState(false);
  const [hoveredProductId, setHoveredProductId] = useState(null);
  const [activeSlides, setActiveSlides] = useState({});

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || hasRequested) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasRequested(true);
          observer.disconnect();
        }
      },
      { rootMargin: "420px 0px", threshold: 0.01 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [hasRequested]);

  useEffect(() => {
    if (!hasRequested) return undefined;

    const controller = new AbortController();
    const params = new URLSearchParams({
      status: "active",
      stockStatus: "in_stock",
      storeFrontVisibility: "true",
      newArrival: "true",
      limit: "10",
      view: "home",
    });

    fetch(`${API_ENDPOINTS.products}?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => setProducts((data.items || data).slice(0, 10)))
      .catch((error) => {
        if (error.name !== "AbortError") setProducts([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [hasRequested]);

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
      { threshold: 0.01, rootMargin: "0px 0px 220px 0px" },
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [loading, products]);

  useEffect(() => {
    if (!hoveredProductId) return undefined;

    const product = products.find((item) => item.id === hoveredProductId);
    const imageCount = getProductImages(product || {}).length;
    if (imageCount <= 1) return undefined;

    const timer = window.setInterval(() => {
      setActiveSlides((current) => ({
        ...current,
        [hoveredProductId]: ((current[hoveredProductId] || 0) + 1) % imageCount,
      }));
    }, 1450);

    return () => window.clearInterval(timer);
  }, [hoveredProductId, products]);

  const handleCardEnter = (productId) => {
    setHoveredProductId(productId);
  };

  const handleCardLeave = (productId) => {
    setHoveredProductId((current) => (current === productId ? null : current));
    setActiveSlides((current) => ({ ...current, [productId]: 0 }));
  };

  return (
    <section className="bk-arrivals-section" ref={sectionRef}>
      <div className="bk-arrivals-shell">
        <div className="bk-arrivals-copy">
          <span className="bk-arrivals-kicker">Fresh Drapes</span>
          <h2>New Arrivals</h2>
          <p>Freshly added sarees, ready for the first glance and the next celebration.</p>
          <Link to="/collection" className="bk-arrivals-link">
            View Collection
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>

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

              return (
                <article
                  key={product.id}
                  className="bk-arrival-card"
                  onMouseEnter={() => handleCardEnter(product.id)}
                  onMouseLeave={() => handleCardLeave(product.id)}
                  onFocus={() => handleCardEnter(product.id)}
                  onBlur={() => handleCardLeave(product.id)}
                  style={{ transitionDelay: `${Math.min(index * 70, 490)}ms` }}
                >
                  <Link to={`/product/${product.slug}`} className="bk-arrival-link">
                    <div className="bk-arrival-media">
                      <div
                        className="bk-arrival-track"
                        style={{
                          "--arrival-slide-count": sliderImages.length,
                          transform: `translateX(-${activeIndex * (100 / sliderImages.length)}%)`,
                        }}
                      >
                        {sliderImages.map((image, imageIndex) => (
                          <span className="bk-arrival-slide" key={`${image.url}-${imageIndex}`}>
                            <img src={image.url} alt="" className="bk-arrival-image-bg" aria-hidden="true" />
                            <img src={image.url} alt={product.name} className="bk-arrival-image" />
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
                    </div>

                    <div className="bk-arrival-info">
                      <h3>{product.name}</h3>
                      <div className="bk-arrival-price-row">
                        <span className="bk-arrival-price">&#8377;{sell.toLocaleString("en-IN")}</span>
                        {mrp > sell && <span className="bk-arrival-mrp">&#8377;{mrp.toLocaleString("en-IN")}</span>}
                        {disc > 0 && <span className="bk-arrival-discount">{disc}% OFF</span>}
                      </div>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default NewArrivals;
