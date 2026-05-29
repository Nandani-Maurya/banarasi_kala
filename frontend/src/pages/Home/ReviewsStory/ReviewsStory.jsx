import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_ENDPOINTS } from "../../../config/api";
import "./ReviewsStory.css";

const storySectionImages = import.meta.glob(
  "../../../assets/story/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default" },
);

const getSectionImage = (images, name) => {
  const entry = Object.entries(images).find(([path]) =>
    path.toLowerCase().includes(name),
  );
  return entry?.[1] || "";
};

const STORY_IMAGES = {
  weave: getSectionImage(storySectionImages, "banaras-weave"),
  ghat: getSectionImage(storySectionImages, "banaras-ghat"),
};

const ReviewsStory = () => {
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_ENDPOINTS.feedback}/approved`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) setReviews(data.data || []);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setReviews([]);
      })
      .finally(() => setLoadingReviews(false));

    return () => controller.abort();
  }, []);

  const hasReviews = reviews.length > 0;

  return (
    <section className="bk-reviews-story">
      <div
        className="bk-banaras-story"
        style={{
          "--bk-story-ghat": STORY_IMAGES.ghat
            ? `url(${STORY_IMAGES.ghat})`
            : "none",
        }}
      >
        <div className="bk-story-image">
          {STORY_IMAGES.weave && (
            <img src={STORY_IMAGES.weave} alt="Banarasi artisan weaving saree" />
          )}
        </div>
        <div className="bk-story-copy">
          <h2>Our Banaras Story</h2>
          <p>
            From the timeless lanes of Banaras to your wardrobe. Each saree is a
            celebration of heritage, woven by skilled artisans using age-old
            techniques passed down through generations. We bring you the essence
            of Banaras, crafted with love and perfection.
          </p>
          <Link to="/about" className="bk-story-cta">
            Know Our Story
          </Link>
        </div>
      </div>

      {(loadingReviews || hasReviews) && (
        <div className="bk-review-shell">
          <div className="bk-review-row">
            <button className="bk-review-arrow" type="button" aria-label="Previous reviews">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div className="bk-review-cards">
              {loadingReviews ? (
                [...Array(4)].map((_, index) => (
                  <article className="bk-review-card bk-review-skeleton-card" key={index}>
                    <div className="bk-review-skeleton-stars" />
                    <div className="bk-review-skeleton-line wide" />
                    <div className="bk-review-skeleton-line" />
                    <div className="bk-review-skeleton-line short" />
                  </article>
                ))
              ) : reviews.slice(0, 4).map((item, i) => {
                const rating = Number(item.rating || 0);
                const reviewerName = item.Customer?.name || item.name;

                return (
                  <article className="bk-review-card" key={item.id || i}>
                    {rating > 0 && (
                      <div className="bk-review-stars" aria-label={`${rating} star rating`}>
                        {[...Array(rating)].map((_, idx) => (
                          <svg key={idx} viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        ))}
                      </div>
                    )}
                    <p>{item.comment || item.text}</p>
                    {reviewerName && <strong>- {reviewerName}</strong>}
                  </article>
                );
              })}
            </div>

            <button className="bk-review-arrow" type="button" aria-label="Next reviews">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default ReviewsStory;
