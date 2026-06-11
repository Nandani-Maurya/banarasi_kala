import { Icon } from "@iconify/react";
import { Link } from "react-router-dom";
import { imgUrl } from "../utils/cloudinary";
import "./CheckoutReviewSummary.css";

const CheckoutReviewSummary = ({
  title = "Order Summary",
  items = [],
  showOffers = true,
  coupons = [],
  appliedCoupon,
  couponDiscount = 0,
  couponCode = "",
  setCouponCode,
  couponLoading = false,
  onApplyCoupon,
  onRemoveCoupon,
  walletBalance = 0,
  useWallet = false,
  setUseWallet,
  rows = [],
  deliveryPromise,
  logistics,
  totalLabel = "Total Payable",
  total,
  formatMoney,
  action,
  couponModalOpen,
  setCouponModalOpen,
  couponCodeOpen,
  setCouponCodeOpen,
  couponCelebration,
}) => {
  const money = formatMoney || ((value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`);
  const firstCoupon = coupons[0];

  const getCouponSavingsText = (coupon) => {
    if (!coupon) return "Coupons & offers";
    const code = String(coupon.code || "").toUpperCase();
    if (coupon.discount_type === "percentage") return `Save ${Number(coupon.discount_percent || 0)}% with ${code}`;
    return `Save ${money(coupon.discount_amount)} with ${code}`;
  };

  const getCouponSubtext = (coupon) => {
    if (!coupon) return "Choose an offer for this order.";
    return coupon.description || "Tap to apply this offer at checkout.";
  };

  return (
    <>
      <div className="crs-card">
        {title && <h3>{title}</h3>}

        <div className="crs-items">
          {items.map((item) => (
            <div className={`crs-item ${item.unavailable ? "unavailable" : ""}`} key={item.key}>
              {item.href ? (
                <Link to={item.href} className="crs-item-image" aria-label={`Open ${item.name}`}>
                  {item.image && <img src={imgUrl(item.image)} alt={item.name} />}
                </Link>
              ) : (
                <span className="crs-item-image">{item.image && <img src={imgUrl(item.image)} alt="" />}</span>
              )}
              <div>
                <strong>{item.name}</strong>
                {item.meta && <span>{item.meta}</span>}
                {item.unavailable && <em>{item.unavailableLabel || "Unavailable - excluded from total"}</em>}
              </div>
              <b>{item.total}</b>
            </div>
          ))}
        </div>

        {showOffers && (
          <div className="crs-offers">
            <div className="crs-offers-head">
              <Icon icon="lucide:badge-percent" />
              <strong>Coupons & offers</strong>
            </div>
            <button
              type="button"
              className="crs-coupon-feature"
              onClick={() => (appliedCoupon ? null : onApplyCoupon?.(firstCoupon))}
              disabled={couponLoading || Boolean(appliedCoupon) || !firstCoupon}
            >
              <span className="crs-coupon-badge"><Icon icon="lucide:percent" /></span>
              <span className="crs-coupon-copy">
                <strong>{appliedCoupon ? `Applied ${appliedCoupon.code}` : getCouponSavingsText(firstCoupon)}</strong>
                <small>{appliedCoupon ? `${money(couponDiscount)} saved on this order` : getCouponSubtext(firstCoupon)}</small>
              </span>
              <Icon icon={appliedCoupon ? "lucide:check-circle-2" : "lucide:chevron-right"} />
            </button>
            {appliedCoupon ? (
              <button type="button" className="crs-remove-coupon" onClick={onRemoveCoupon}>Remove coupon</button>
            ) : coupons.length > 1 ? (
              <button type="button" className="crs-view-coupons" onClick={() => setCouponModalOpen?.(true)}>
                View all coupons
                <Icon icon="lucide:chevron-right" />
              </button>
            ) : null}
            <label className={`crs-wallet ${Number(walletBalance || 0) <= 0 ? "disabled" : ""}`}>
              <span>
                <strong>Use wallet balance</strong>
                <small>{Number(walletBalance || 0) > 0 ? `${money(walletBalance)} available` : "No wallet balance available"}</small>
              </span>
              <input
                type="checkbox"
                checked={useWallet}
                disabled={Number(walletBalance || 0) <= 0}
                onChange={(event) => setUseWallet?.(event.target.checked)}
              />
            </label>
          </div>
        )}

        <div className="crs-totals">
          {rows.map((row, idx) =>
            row.divider ? (
              <div key={`divider-${idx}`} className="crs-divider">
                {row.label && <span>{row.label}</span>}
              </div>
            ) : (
              <p key={row.label} className={row.tone === "success" ? "crs-success" : row.tone === "accent" ? "crs-accent" : ""}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </p>
            )
          )}
          {deliveryPromise && (
            <div className="crs-delivery">
              <strong>{deliveryPromise.title}</strong>
              <span>
                {deliveryPromise.subtitle}
                {deliveryPromise.tooltip && (
                  <button type="button" className="crs-info" aria-label="Delivery information" data-tooltip={deliveryPromise.tooltip}>
                    <Icon icon="lucide:info" />
                  </button>
                )}
              </span>
            </div>
          )}
          {logistics && (
            <div className="crs-logistics">
              <span>{logistics.label}</span>
              <button type="button" className="crs-info" aria-label="Return and exchange information" data-tooltip={logistics.tooltip}>
                <Icon icon="lucide:info" />
              </button>
            </div>
          )}
          <p className="crs-total">
            <span>{totalLabel}</span>
            <strong>{money(total)}</strong>
          </p>
        </div>

        {action && (
          <button type="button" className="crs-action" onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </button>
        )}
      </div>

      {couponModalOpen && (
        <div className="crs-coupon-modal" role="dialog" aria-modal="true" aria-label="Coupons and offers">
          <div className="crs-coupon-modal-card">
            <button type="button" className="crs-coupon-modal-close" onClick={() => setCouponModalOpen?.(false)} aria-label="Close coupons">
              <Icon icon="lucide:x" />
            </button>
            <div className="crs-coupon-modal-title">
              <Icon icon="lucide:badge-percent" />
              <div>
                <span>Checkout offers</span>
                <h3>Coupons & offers</h3>
              </div>
            </div>
            <button type="button" className="crs-manual-coupon" onClick={() => setCouponCodeOpen?.((open) => !open)}>
              Have a coupon code?
              <Icon icon={couponCodeOpen ? "lucide:chevron-up" : "lucide:chevron-down"} />
            </button>
            {couponCodeOpen && (
              <div className="crs-coupon-entry">
                <input value={couponCode} onChange={(event) => setCouponCode?.(event.target.value.toUpperCase())} placeholder="Coupon code" />
                <button type="button" onClick={() => onApplyCoupon?.(couponCode)} disabled={couponLoading}>Apply</button>
              </div>
            )}
            {coupons.length > 0 ? (
              <div className="crs-coupon-list">
                {coupons.map((coupon) => (
                  <button type="button" key={coupon.id || coupon.code} onClick={() => onApplyCoupon?.(coupon)} disabled={couponLoading}>
                    <span className="crs-coupon-code">{coupon.code}</span>
                    <span className="crs-coupon-detail">
                      <strong>{getCouponSavingsText(coupon)}</strong>
                      <small>{getCouponSubtext(coupon)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="crs-coupon-empty">No coupons are available right now.</p>
            )}
          </div>
        </div>
      )}

      {couponCelebration && (
        <div className="crs-coupon-boom" role="status" aria-live="polite">
          <span><Icon icon="lucide:sparkles" /></span>
          <div>
            <strong>Yay! Coupon applied</strong>
            <p>{Number(couponCelebration.discount || 0) > 0 ? `${money(couponCelebration.discount)} off with ${couponCelebration.code}` : `${couponCelebration.code} is active on this order`}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default CheckoutReviewSummary;
