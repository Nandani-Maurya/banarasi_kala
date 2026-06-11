import { Icon } from "@iconify/react";
import { useState, useEffect, useRef } from "react";
import { imgUrl } from "../../utils/cloudinary";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWishlist } from "../../context/WishlistContext";
import { useNotification } from "../../context/NotificationContext";
import { API_ENDPOINTS } from "../../config/api";
import { getProductCoverImage, getProductImages } from "../../utils/productMedia";
import { getProductStockInfo } from "../../utils/stockStatus";
import ProductRating from "../../components/ProductRating";
import "./Collection.css";

const PAGE_SIZE = 20;

const getIdListParam = (params, key) =>
  (params.get(key) || "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

const getSortParam = (params) => {
  const sort = params.get("sort");
  if (sort === "special" || sort === "price_asc" || sort === "price_desc") return sort;
  if (sort === "popular") return "special";
  return "newest";
};

const Collection = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [occasions, setOccasions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [colors, setColors] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedFilters, setExpandedFilters] = useState({});
  const [loadedImages, setLoadedImages] = useState({});
  const [hoveredProductId, setHoveredProductId] = useState(null);
  const [activeSlides, setActiveSlides] = useState({});
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const productsRequestId = useRef(0);
  const isFirstSearchParamsRun = useRef(true);

  const [filters, setFilters] = useState(() => ({
    variety: getIdListParam(searchParams, "variety"),
    occasion: [],
    material: [],
    color: [],
    minPrice: 0,
    maxPrice: 200000,
    sortBy: getSortParam(searchParams),
    search: searchParams.get("search") || "",
  }));

  useEffect(() => {
    if (isFirstSearchParamsRun.current) {
      isFirstSearchParamsRun.current = false;
      return;
    }
    const urlSearch = searchParams.get("search") || "";
    const urlVarieties = getIdListParam(searchParams, "variety");
    setFilters((prev) => ({
      ...prev,
      search: urlSearch,
      variety: urlVarieties,
      sortBy: getSortParam(searchParams),
    }));
    setCurrentPage(1);
  }, [searchParams]);

  const totalPaginationPages = Math.ceil(totalItems / PAGE_SIZE);


  // Fetch lean metadata for filters.
  useEffect(() => {
    const fetchMetadata = async () => {
      setFiltersLoading(true);
      try {
        const leanFields = "fields=id,name,slug";
        const [occRes, matRes, colRes, varRes] = await Promise.all([
          fetch(`${API_ENDPOINTS.occasions}?${leanFields}`),
          fetch(`${API_ENDPOINTS.materials}?${leanFields}`),
          fetch(API_ENDPOINTS.colors),
          fetch(`${API_ENDPOINTS.varieties}?${leanFields}`),
        ]);
        const [occData, matData, colData, varData] = await Promise.all([
          occRes.json(),
          matRes.json(),
          colRes.json(),
          varRes.json(),
        ]);
        setOccasions(occData);
        setMaterials(matData);
        setColors(colData);
        setVarieties(varData);
      } catch (error) {
        console.error("Error fetching metadata:", error);
      } finally {
        setFiltersLoading(false);
      }
    };
    fetchMetadata();
  }, []);

  // Fetch Products
  const fetchProducts = async (page) => {
    const requestId = productsRequestId.current + 1;
    productsRequestId.current = requestId;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("paginated", "true");
      params.append("page", page);
      params.append("pageSize", PAGE_SIZE);
      params.append("status", "active");
      params.append("view", "collection");
      
      if (filters.variety.length) params.append("variety", filters.variety.join(","));
      if (filters.occasion.length) params.append("occasion", filters.occasion.join(","));
      if (filters.material.length) params.append("material", filters.material.join(","));
      if (filters.color.length) params.append("color", filters.color.join(","));
      if (filters.minPrice > 0) params.append("minPrice", filters.minPrice);
      if (filters.maxPrice < 200000) params.append("maxPrice", filters.maxPrice);
      if (filters.sortBy) params.append("sortBy", filters.sortBy);
      if (filters.search && filters.search.trim()) params.append("search", filters.search.trim());

      const res = await fetch(`${API_ENDPOINTS.products}?${params.toString()}`);
      const data = await res.json();

      if (requestId !== productsRequestId.current) return;

      setProducts(data.items || []);
      setLoadedImages({});
      setActiveSlides({});
      setHoveredProductId(null);
      setTotalItems(data.meta?.totalItems ?? 0);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      if (requestId === productsRequestId.current) setLoading(false);
    }
  };

  // Reveal Observer for Fade-in Animation
  useEffect(() => {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.01, rootMargin: "0px 0px 220px 0px" }
    );

    const cards = document.querySelectorAll(".reveal-card:not(.visible)");
    cards.forEach((card) => revealObserver.observe(card));

    return () => revealObserver.disconnect();
  }, [products, loading]);


  useEffect(() => {
    fetchProducts(currentPage);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [filters, currentPage]);

  useEffect(() => {
    if (!mobileFiltersOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileFiltersOpen]);



  const handleCheckboxChange = (type, id) => {
    setCurrentPage(1);
    setFilters((prev) => {
      const current = prev[type];
      const updated = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      return { ...prev, [type]: updated };
    });
  };

  const handlePriceChange = (e) => {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, maxPrice: e.target.value }));
  };

  const handleSortChange = (e) => {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, sortBy: e.target.value }));
  };

  const toggleFilterExpand = (key) => {
    setExpandedFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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

    const startTimer = window.setTimeout(advanceSlide, 650);
    const timer = window.setInterval(advanceSlide, 2200);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(timer);
    };
  }, [hoveredProductId, products]);

  const handleCardEnter = (productId) => {
    setHoveredProductId(productId);
  };

  const handleCardLeave = (productId) => {
    setHoveredProductId((current) => (current === productId ? null : current));
    setActiveSlides((current) => ({ ...current, [productId]: 0 }));
  };

  const goToSlide = (event, productId, slideIndex) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveSlides((current) => ({ ...current, [productId]: slideIndex }));
    setHoveredProductId(productId);
  };

  const markImageLoaded = (productId) => {
    setLoadedImages((current) => ({ ...current, [productId]: true }));
  };

  const calculateDiscount = (mrp, selling) => {
    const m = Number(mrp);
    const s = Number(selling);
    if (!m || !s || m <= s) return 0;
    return Math.round(((m - s) / m) * 100);
  };

  const clearAllFilters = () => {
    setCurrentPage(1);
    setFilters({
      variety: [],
      occasion: [],
      material: [],
      color: [],
      minPrice: 0,
      maxPrice: 200000,
      sortBy: "newest",
      search: "",
    });
  };

  const handleWishlist = async (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      showNotification("Please login first", "info");
      navigate("/wishlist");
      return;
    }
    await toggleWishlist(product);
  };

  const renderFilterGroup = (key, title, items, filterKey, renderExtra = null) => {
    const isExpanded = Boolean(expandedFilters[key]);
    const visibleItems = isExpanded ? items : items.slice(0, 5);
    const hiddenCount = Math.max(0, items.length - visibleItems.length);

    return (
      <div className="filter-section">
        <h3 className="filter-title">{title}</h3>
        <div className="filter-list">
          {visibleItems.map((item) => (
            <label key={item.id} className="filter-item">
              <input
                type="checkbox"
                checked={filters[filterKey].includes(item.id)}
                onChange={() => handleCheckboxChange(filterKey, item.id)}
              />
              {renderExtra?.(item)}
              {item.name}
            </label>
          ))}
        </div>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="filter-more-btn"
            onClick={() => toggleFilterExpand(key)}
          >
            +{hiddenCount} more
          </button>
        )}
        {isExpanded && items.length > 5 && (
          <button
            type="button"
            className="filter-more-btn filter-less-btn"
            onClick={() => toggleFilterExpand(key)}
          >
            Show less
          </button>
        )}
      </div>
    );
  };

  const renderPriceFilter = () => (
    <div className="filter-section collection-price-section">
      <h3 className="filter-title">Price</h3>
      <div className="collection-price-filter">
        <input
          type="range"
          min="0"
          max="200000"
          step="1000"
          value={filters.maxPrice}
          onChange={handlePriceChange}
        />
        <div className="collection-price-range">
          <span>Rs. 0</span>
          <span>Rs. {Number(filters.maxPrice).toLocaleString("en-IN")}</span>
        </div>
      </div>
    </div>
  );

  const renderFilterSkeleton = (priceFirst = false) => (
    <div className="filter-skeleton-wrap" aria-label="Loading filters">
      {priceFirst && (
        <div className="filter-section filter-price-skeleton">
          <span className="filter-skeleton-title" />
          <span className="filter-skeleton-price-track" />
          <span className="filter-skeleton-price-values" />
        </div>
      )}
      {Array.from({ length: 4 }).map((_, sectionIndex) => (
        <div className="filter-section" key={sectionIndex}>
          <span className="filter-skeleton-title" />
          {Array.from({ length: 5 }).map((__, itemIndex) => (
            <span className="filter-skeleton-row" key={itemIndex} />
          ))}
        </div>
      ))}
      {!priceFirst && (
        <div className="filter-section filter-price-skeleton">
          <span className="filter-skeleton-title" />
          <span className="filter-skeleton-price-track" />
          <span className="filter-skeleton-price-values" />
        </div>
      )}
    </div>
  );

  const hasActiveFilters =
    filters.variety.length > 0 ||
    filters.occasion.length > 0 ||
    filters.material.length > 0 ||
    filters.color.length > 0 ||
    filters.search.trim().length > 0 ||
    Number(filters.minPrice) > 0 ||
    Number(filters.maxPrice) < 200000;

  const renderFiltersBody = ({ priceFirst = false } = {}) => (
    <>
      {filtersLoading ? (
        renderFilterSkeleton(priceFirst)
      ) : (
        <>
          {priceFirst && renderPriceFilter()}
          {renderFilterGroup("variety", "Variety", varieties, "variety")}
          {renderFilterGroup("material", "Fabric", materials, "material")}
          {renderFilterGroup("occasion", "Occasions", occasions, "occasion")}
          {renderFilterGroup("color", "Color", colors, "color", (col) => (
            <svg className="color-swatch" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="7.5" fill={col.hex_code || "#cccccc"} />
            </svg>
          ))}
          {!priceFirst && renderPriceFilter()}
        </>
      )}
    </>
  );

  return (
    <div className="collection-container">
      <nav className="breadcrumb">
        <Link to="/">Home</Link>
        <span className="mx-2">/</span>
        <span>Clothing</span>
        <span className="mx-2">/</span>
        <span className="font-bold">Sarees</span>
      </nav>

      <div className="page-header">
        <h1 className="page-title">Sarees For Women</h1>
        <span className="item-count">- {totalItems} items</span>
      </div>

      <div className="main-content">
        <aside className="filters-sidebar">
          <div className="sidebar-header">
            <h2>FILTERS</h2>
            {hasActiveFilters && (
                <button className="clear-btn" onClick={clearAllFilters}>
                  Clear All
                </button>
              )}
          </div>

          {renderFiltersBody()}
        </aside>

        <section className="product-listing">
          <div className="listing-controls">
            <button
              type="button"
              className="mobile-filter-trigger"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <Icon icon="lucide:sliders-horizontal" />
              Filters
            </button>
            <div className="sort-container">
              <select value={filters.sortBy} onChange={handleSortChange}>
                <option value="newest">Sort by: New Arrivals</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="special">Exclusive Picks</option>
              </select>
            </div>
          </div>

          <div className="product-grid">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="product-card">
                  <div className="card-img-container skeleton"></div>
                  <div className="card-details">
                    <div className="skeleton skeleton-title"></div>
                    <div className="skeleton skeleton-description"></div>
                    <div className="skeleton skeleton-price"></div>
                  </div>
                </div>
              ))
            ) : products.length === 0 ? (
              <div className="col-span-full text-center py-20 text-gray-500">
                No products found matching your filters.
              </div>
            ) : (
              products.map((product) => {
                const cover = getProductCoverImage(product, "https://via.placeholder.com/400x600?text=VNS+Saree");
                const productImages = getProductImages(product);
                const sliderImages = productImages.length > 0 ? productImages : [{ url: cover }];
                const activeSlide = activeSlides[product.id] || 0;
                const imageReady = Boolean(loadedImages[product.id]);
                const stockInfo = getProductStockInfo(product);
                const isOutOfStock = stockInfo.isOutOfStock;
                const isLowStock = stockInfo.isLowStock;

                return (
                <div
                  key={product.id}
                  className={`product-card reveal-card ${isOutOfStock ? "out-of-stock" : ""}`}
                  onPointerEnter={() => handleCardEnter(product.id)}
                  onPointerLeave={() => handleCardLeave(product.id)}
                >
                  <button
                    type="button"
                    className={`collection-wishlist-pill ${isInWishlist(product.id) ? "active" : ""}`}
                    onClick={(e) => handleWishlist(e, product)}
                    aria-label={isInWishlist(product.id) ? "Remove from wishlist" : "Add to wishlist"}
                  >
                    <Icon
                      className="wishlist-icon"
                      icon={isInWishlist(product.id) ? "mdi:heart" : "lucide:heart"}
                    />
                  </button>

                  <Link
                    to={`/product/${product.slug}`}
                    className="card-img-container"
                  >
                    {!imageReady && <span className="card-image-shimmer" aria-hidden="true" />}
                    {isOutOfStock && <span className="collection-stock-badge">Out of stock</span>}
                    {isLowStock && <span className="collection-stock-badge low">{stockInfo.badge}</span>}
                    <div
                      className={`card-img-track ${imageReady ? "is-loaded" : ""}`}
                      style={{ transform: `translateX(-${activeSlide * 100}%)` }}
                    >
                      {sliderImages.map((image, imageIndex) => (
                        <img
                          key={`${product.id}-${image.url}-${imageIndex}`}
                          src={imgUrl(image.url)}
                          alt={imageIndex === 0 ? product.name : ""}
                          className="card-img"
                          loading="lazy"
                          onLoad={() => {
                            if (imageIndex === 0) markImageLoaded(product.id);
                          }}
                        />
                      ))}
                    </div>
                    {sliderImages.length > 1 && (
                      <div className="collection-card-dots" aria-hidden="true">
                        {sliderImages.map((image, imageIndex) => (
                          <button
                            type="button"
                            key={`${image.url}-${imageIndex}`}
                            className={imageIndex === activeSlide ? "active" : ""}
                            onClick={(event) => goToSlide(event, product.id, imageIndex)}
                            tabIndex={-1}
                          />
                        ))}
                      </div>
                    )}
                  </Link>

                  <div className="card-details">
                    <p className="product-title" title={product.name || "Premium Saree"}>
                      {product.name || "Handcrafted Banarasi Saree"}
                    </p>
                    {product.short_description && (
                      <p className="product-short-desc">
                        {product.short_description}
                      </p>
                    )}
                    <div className="price-container">
                      <span className="selling-price">
                        Rs. {Number(product.selling_price || 0).toLocaleString("en-IN")}
                      </span>
                      {Number(product.mrp_price || product.mrp || 0) > Number(product.selling_price || 0) && (
                        <>
                          <span className="mrp-price">
                            Rs. {Number(product.mrp_price || product.mrp).toLocaleString("en-IN")}
                          </span>
                          <span className="discount-text">
                            ({calculateDiscount(product.mrp_price || product.mrp, product.selling_price)}% OFF)
                          </span>
                        </>
                      )}
                    </div>
                    <ProductRating product={product} className="collection-product-rating" />
                  </div>
                </div>
              );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPaginationPages > 1 && (
            <div className="pagination">

              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="page-btn"
              >
                <Icon icon="lucide:chevron-left" className="mr-1"></Icon>
                Prev
              </button>
              {[...Array(totalPaginationPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`page-btn ${currentPage === i + 1 ? "active" : ""}`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={currentPage === totalPaginationPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="page-btn"
              >
                Next
                <Icon icon="lucide:chevron-right" className="ml-1"></Icon>
              </button>
            </div>
          )}
          {/* End of product listing */}
        </section>
      </div>

      {mobileFiltersOpen && (
        <div
          className="mobile-filter-backdrop"
          role="presentation"
          onClick={() => setMobileFiltersOpen(false)}
        >
          <aside
            className="mobile-filter-drawer"
            aria-label="Collection filters"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-filter-header">
              <div>
                <span>Refine Sarees</span>
                <h2>Filters</h2>
              </div>
              <button
                type="button"
                className="mobile-filter-close"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Close filters"
              >
                <Icon icon="lucide:x" />
              </button>
            </div>

            <div className="mobile-filter-body">
              <div className="sidebar-header mobile-filter-actions">
                <h2>FILTERS</h2>
                {hasActiveFilters && (
                  <button className="clear-btn" onClick={clearAllFilters}>
                    Clear All
                  </button>
                )}
              </div>
              {renderFiltersBody({ priceFirst: true })}
            </div>

            <div className="mobile-filter-footer">
              <button type="button" onClick={() => setMobileFiltersOpen(false)}>
                View {totalItems || ""} Sarees
              </button>
            </div>
          </aside>
        </div>
      )}

    </div>
  );
};

export default Collection;

