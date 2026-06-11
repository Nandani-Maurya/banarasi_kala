import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { imgUrl } from "../../../utils/cloudinary";
import { API_ENDPOINTS } from "../../../config/api";
import "./OccasionCollections.css";

const OccasionCollections = () => {
  const navigate = useNavigate();
  const [occasions, setOccasions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_ENDPOINTS.occasions}?limit=4`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setOccasions(Array.isArray(data) ? data.filter((item) => item.image) : []))
      .catch((error) => {
        if (error.name !== "AbortError") setOccasions([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const openOccasion = (occasionId) => {
    navigate(`/collection?occasion=${occasionId}`);
  };

  return (
    <section className="bk-occasion-section">
      <div className="bk-occasion-shell">
        <div className="bk-occasion-heading">
          <span>Crafted for Your Special Occasions</span>
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
                <img src={imgUrl(occasion.image)} alt={occasion.name} />
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
