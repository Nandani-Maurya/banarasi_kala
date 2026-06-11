import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { imgUrl } from "../../../utils/cloudinary";
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
  const mobileScrollerRef = useRef(null);
  const dragStateRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
  const pauseAutoScrollUntilRef = useRef(0);
  const suppressClickRef = useRef(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  const marqueeItems = useMemo(() => [...items, ...items], [items]);

  const openItem = (href) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    navigate(href);
  };

  const pauseMobileAutoScroll = (duration = 2600) => {
    pauseAutoScrollUntilRef.current = Date.now() + duration;
  };

  const handleMobilePointerDown = (event) => {
    const scroller = mobileScrollerRef.current;
    if (!scroller) return;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
    };
    pauseMobileAutoScroll();
  };

  const handleMobilePointerMove = (event) => {
    const scroller = mobileScrollerRef.current;
    const dragState = dragStateRef.current;
    if (!scroller || !dragState.active) return;

    const deltaX = event.clientX - dragState.startX;
    if (Math.abs(deltaX) > 4) {
      suppressClickRef.current = true;
      scroller.scrollLeft = dragState.startScrollLeft - deltaX;
      pauseMobileAutoScroll();
    }
  };

  const handleMobilePointerEnd = () => {
    dragStateRef.current.active = false;
    pauseMobileAutoScroll();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 80);
  };

  useEffect(() => {
    const scroller = mobileScrollerRef.current;
    if (!scroller || items.length === 0) return undefined;

    let frameId;
    let lastTime = performance.now();
    const speed = 22;

    const scroll = (time) => {
      const delta = Math.min(time - lastTime, 64);
      lastTime = time;

      if (Date.now() > pauseAutoScrollUntilRef.current && scroller.scrollWidth > scroller.clientWidth) {
        scroller.scrollLeft += (speed * delta) / 1000;
        const resetAt = scroller.scrollWidth / 2;
        if (resetAt > 0 && scroller.scrollLeft >= resetAt) {
          scroller.scrollLeft -= resetAt;
        } else if (scroller.scrollLeft <= 0) {
          scroller.scrollLeft += resetAt;
        }
      }

      frameId = window.requestAnimationFrame(scroll);
    };

    frameId = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(frameId);
  }, [items.length]);

  return (
    <section className="bk-browse-section">
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
            <div
              ref={mobileScrollerRef}
              className="bk-browse-mobile-wrap"
              onPointerDown={handleMobilePointerDown}
              onPointerMove={handleMobilePointerMove}
              onPointerUp={handleMobilePointerEnd}
              onPointerCancel={handleMobilePointerEnd}
              onPointerLeave={handleMobilePointerEnd}
              onMouseEnter={() => pauseMobileAutoScroll()}
              onWheel={() => pauseMobileAutoScroll()}
            >
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
                    {item.image ? <img src={imgUrl(item.image)} alt={item.name} /> : <span>{item.name.slice(0, 1)}</span>}
                  </span>
                  <span className="bk-browse-name">{item.name}</span>
                </button>
              ))}
            </div>
            <div
              ref={mobileScrollerRef}
              className="bk-browse-mobile-wrap"
              onPointerDown={handleMobilePointerDown}
              onPointerMove={handleMobilePointerMove}
              onPointerUp={handleMobilePointerEnd}
              onPointerCancel={handleMobilePointerEnd}
              onPointerLeave={handleMobilePointerEnd}
              onMouseEnter={() => pauseMobileAutoScroll()}
              onWheel={() => pauseMobileAutoScroll()}
            >
              <div className="bk-browse-row bk-browse-mobile">
                {marqueeItems.map((item, index) => (
                  <button
                    type="button"
                    key={`${item.id}-${index}`}
                    className="bk-browse-card"
                    onClick={() => openItem(item.href)}
                  >
                    <span className="bk-browse-circle">
                      {item.image ? <img src={imgUrl(item.image)} alt={item.name} /> : <span>{item.name.slice(0, 1)}</span>}
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
