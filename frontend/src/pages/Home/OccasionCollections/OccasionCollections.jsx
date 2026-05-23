import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_ENDPOINTS } from "../../../config/api";
import "./OccasionCollections.css";

const OccasionCollections = () => {
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const [occasions, setOccasions] = useState([]);
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
    fetch(`${API_ENDPOINTS.occasions}?limit=4`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setOccasions(Array.isArray(data) ? data.filter((item) => item.image) : []))
      .catch((error) => {
        if (error.name !== "AbortError") setOccasions([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [hasRequested]);

  const openOccasion = (occasionId) => {
    navigate(`/collection?occasion=${occasionId}`);
  };

  return (
    <section className="bk-occasion-section" ref={sectionRef}>
      <div className="bk-occasion-shell">
        <div className="bk-occasion-heading">
          <span>Occasion Wear</span>
          <h2>Occasion Special Sarees</h2>
        </div>

        {loading ? (
          <div className="bk-occasion-row">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="bk-occasion-card bk-occasion-skeleton">
                <span />
              </div>
            ))}
          </div>
        ) : occasions.length === 0 ? (
          <div className="bk-occasion-empty" role="status">
            Occasion collections will appear here soon.
          </div>
        ) : (
          <div className="bk-occasion-row">
            {occasions.map((occasion, index) => (
              <button
                type="button"
                key={occasion.id}
                className="bk-occasion-card"
                style={{ "--bk-occasion-delay": `${Math.min(index * 90, 360)}ms` }}
                onClick={() => openOccasion(occasion.id)}
              >
                <img src={occasion.image} alt={occasion.name} />
                <span className="bk-occasion-overlay" />
                <span className="bk-occasion-name">{occasion.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default OccasionCollections;
