import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_ENDPOINTS } from "../../../config/api";
import "./BrowseCircles.css";

const normalizeItems = (varieties = []) => [
  ...varieties.map((item) => ({
    id: `variety-${item.id}`,
    name: item.name,
    image: item.image,
    href: `/collection?variety=${item.id}`,
  })),
];

const BrowseCircles = () => {
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasRequested, setHasRequested] = useState(false);

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
    fetch(API_ENDPOINTS.varieties, { signal: controller.signal })
      .then((response) => response.json())
      .then((varieties) => {
        setItems(normalizeItems(Array.isArray(varieties) ? varieties : []));
      })
      .catch((error) => {
        if (error.name !== "AbortError") setItems([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [hasRequested]);

  const marqueeItems = useMemo(() => [...items, ...items], [items]);

  const openItem = (href) => {
    navigate(href);
  };

  return (
    <section className="bk-browse-section" ref={sectionRef}>
      <div className="bk-browse-shell">
        <div className="bk-browse-header">
          <span>Variety of Authentic Banarasi Sarees</span>
          <h2>Premium Variety</h2>
        </div>

        {loading ? (
          <>
            <div className="bk-browse-row bk-browse-desktop">
              {[...Array(8)].map((_, index) => (
                <div className="bk-browse-card bk-browse-skeleton" key={index}>
                  <span className="bk-browse-circle" />
                  <span className="bk-browse-line" />
                </div>
              ))}
            </div>
            <div className="bk-browse-mobile-wrap">
              <div className="bk-browse-row bk-browse-mobile">
                {[...Array(12)].map((_, index) => (
                  <div className="bk-browse-card bk-browse-skeleton" key={index}>
                    <span className="bk-browse-circle" />
                    <span className="bk-browse-line" />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : items.length === 0 ? (
          <div className="bk-browse-empty" role="status">Varieties will appear here soon.</div>
        ) : (
          <>
            <div className="bk-browse-row bk-browse-desktop">
              {items.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className="bk-browse-card"
                  style={{ "--bk-browse-delay": `${Math.min(index * 70, 420)}ms` }}
                  onClick={() => openItem(item.href)}
                >
                  <span className="bk-browse-circle">
                    {item.image ? <img src={item.image} alt={item.name} /> : <span>{item.name.slice(0, 1)}</span>}
                  </span>
                  <span className="bk-browse-name">{item.name}</span>
                </button>
              ))}
            </div>
            <div className="bk-browse-mobile-wrap">
              <div className="bk-browse-row bk-browse-mobile">
                {marqueeItems.map((item, index) => (
                  <button
                    type="button"
                    key={`${item.id}-${index}`}
                    className="bk-browse-card"
                    onClick={() => openItem(item.href)}
                  >
                    <span className="bk-browse-circle">
                      {item.image ? <img src={item.image} alt={item.name} /> : <span>{item.name.slice(0, 1)}</span>}
                    </span>
                    <span className="bk-browse-name">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default BrowseCircles;
