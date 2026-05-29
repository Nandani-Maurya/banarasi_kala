import { Icon } from "@iconify/react";
import "./ProductRating.css";

const getSummary = (product = {}) => {
  const summary = product.review_summary || {};
  const count = Number(summary.count ?? product.review_count ?? product.reviews ?? 0);
  const average = Number(summary.average ?? product.rating ?? product.average_rating ?? 0);
  return {
    count: Number.isFinite(count) ? count : 0,
    average: Number.isFinite(average) ? average : 0,
  };
};

const ProductRating = ({ product, className = "" }) => {
  const { average, count } = getSummary(product);
  if (!count || average <= 0) return null;

  return (
    <div className={`product-rating-chip ${className}`} aria-label={`${average.toFixed(1)} rating from ${count} reviews`}>
      <span>
        {[1, 2, 3, 4, 5].map((star) => (
          <Icon
            key={star}
            icon={average >= star ? "mdi:star" : average >= star - 0.5 ? "mdi:star-half-full" : "mdi:star-outline"}
          />
        ))}
      </span>
      <strong>{average.toFixed(1)}</strong>
      <small>({count})</small>
    </div>
  );
};

export default ProductRating;
