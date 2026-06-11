import { Icon } from "@iconify/react";
import { imgUrl } from "../utils/cloudinary";
import CheckoutReviewSummary from "./CheckoutReviewSummary";
import "./CheckoutOrderPanel.css";

const CheckoutOrderPanel = ({
  step = "details",
  addresses = [],
  selectedAddressId = "",
  onSelectAddress,
  onAddAddress,
  onEditAddress,
  onDeleteAddress,
  deletingAddressId = null,
  getAddressLine,
  user,
  addressLoading = false,
  emptyAddressIcon = "lucide:map-pin-plus",
  emptyAddressTitle = "No saved address",
  emptyAddressText = "Add a delivery address to continue.",
  paymentOptions = [],
  deliveryError,
  proceedAction,
  reviewTitle = "Review your order",
  reviewItems = [],
  reviewAddress,
  reviewPayment,
  onEditDetails,
  summaryProps,
  showSummary = true,
}) => {
  const addressLine = getAddressLine || (() => "");
  const reviewPaymentIcon = reviewPayment?.title?.toLowerCase().includes("cash") ? "lucide:banknote" : "lucide:shield-check";

  return (
    <div className={`checkout-order-panel ${showSummary ? "" : "no-summary"}`}>
      <div className="checkout-order-main">
        {step === "details" ? (
          <>
            <section className="buy-now-section checkout-section">
              <div className="buy-now-section-title">
                <h3>Delivery address</h3>
                <button type="button" onClick={onAddAddress}>
                  <Icon icon="lucide:plus" />
                  Add new
                </button>
              </div>

              {addressLoading && !addresses.length ? (
                <div className="buy-now-address-list checkout-address-list">
                  {[0, 1].map((i) => (
                    <div key={i} className="buy-now-address-skeleton">
                      <div className="bnas-radio" />
                      <div className="bnas-lines">
                        <div className="bnas-line bnas-line--title" />
                        <div className="bnas-line bnas-line--addr" />
                        <div className="bnas-line bnas-line--meta" />
                      </div>
                      <div className="bnas-actions">
                        <div className="bnas-btn" />
                        <div className="bnas-btn" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : addresses.length > 0 ? (
                <div className="buy-now-address-list checkout-address-list">
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      className={`buy-now-address ${String(selectedAddressId) === String(address.id) ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        checked={String(selectedAddressId) === String(address.id)}
                        onChange={() => onSelectAddress?.(address)}
                      />
                      <span>
                        <strong>{address.label || "Home"} {address.is_default ? <em>Default</em> : null}</strong>
                        <small>{addressLine(address)}</small>
                        <small>{address.name || user?.name} - {address.phone || user?.phone}</small>
                      </span>
                      <div className="buy-now-address-actions">
                        <button
                          type="button"
                          disabled={String(deletingAddressId) === String(address.id)}
                          onClick={(event) => {
                            event.preventDefault();
                            onEditAddress?.(address);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          disabled={String(deletingAddressId) === String(address.id)}
                          onClick={(event) => {
                            event.preventDefault();
                            onDeleteAddress?.(address);
                          }}
                        >
                          {String(deletingAddressId) === String(address.id) ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="checkout-no-address">
                  <Icon icon={emptyAddressIcon} />
                  <div>
                    <strong>{emptyAddressTitle}</strong>
                    <span>{emptyAddressText}</span>
                  </div>
                  <button type="button" onClick={onAddAddress}>Add address</button>
                </div>
              )}
            </section>

            <section className="buy-now-section checkout-section">
              <div className="buy-now-section-title">
                <h3>Payment</h3>
              </div>
              <div className="buy-now-payment-grid">
                {paymentOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={option.active ? "active" : ""}
                    disabled={option.disabled}
                    onClick={option.onSelect}
                  >
                    <Icon icon={option.icon} />
                    <span>{option.title}</span>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </section>

            {deliveryError && (
              <div className="buy-now-delivery-error" role="status">
                <Icon icon="lucide:map-pin-off" />
                <span>{deliveryError}</span>
              </div>
            )}

            {proceedAction && (
              <button
                type="button"
                className="buy-now-proceed checkout-order-proceed"
                onClick={proceedAction.onClick}
                disabled={proceedAction.disabled}
              >
                {proceedAction.label}
              </button>
            )}
          </>
        ) : (
          <>
            {reviewItems.length > 0 && (
              <section className="buy-now-section checkout-section">
                <div className="buy-now-section-title">
                  <h3>{reviewTitle}</h3>
                  <button type="button" onClick={onEditDetails}>
                    <Icon icon="lucide:arrow-left" />
                    Edit
                  </button>
                </div>
                <div className="checkout-review-grid">
                <div className="checkout-review-panel">
                  <span>Products</span>
                  {reviewItems.map((item) => (
                    <div key={item.key} className={`checkout-review-product ${item.unavailable ? "unavailable" : ""}`}>
                      {item.image && <img src={imgUrl(item.image)} alt="" />}
                      <div>
                        <strong>{item.name}</strong>
                        {item.meta && <small>{item.meta}</small>}
                        {item.unavailable && <small className="checkout-review-unavailable">{item.unavailableLabel || "Unavailable - excluded from total"}</small>}
                      </div>
                      <b>{item.total}</b>
                    </div>
                  ))}
                </div>
                </div>
              </section>
            )}

            {reviewAddress && (
              <section className="buy-now-section checkout-section">
                <div className="buy-now-section-title">
                  <h3>Delivery address</h3>
                  <button type="button" onClick={onEditDetails}>
                    <Icon icon="lucide:arrow-left" />
                    Edit
                  </button>
                </div>
                <div className="buy-now-address checkout-review-address-card active">
                  <input type="radio" checked readOnly aria-label="Selected delivery address" />
                  <span>
                    <strong>{reviewAddress.label || "Home"} {reviewAddress.isDefault ? <em>Default</em> : null}</strong>
                    <small>{reviewAddress.line}</small>
                    <small>{reviewAddress.name} - {reviewAddress.phone}</small>
                  </span>
                  <button type="button" onClick={onEditDetails}>Edit</button>
                </div>
              </section>
            )}

            {reviewPayment && (
              <section className="buy-now-section checkout-section">
                <div className="buy-now-section-title">
                  <h3>Payment</h3>
                </div>
                <div className="buy-now-payment-grid checkout-review-payment-grid">
                  <button type="button" className="active" onClick={onEditDetails}>
                    <Icon icon={reviewPaymentIcon} />
                    <span>{reviewPayment.title}</span>
                    <small>{reviewPayment.description}</small>
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {showSummary && summaryProps && (
        <div className="checkout-order-summary">
          <CheckoutReviewSummary {...summaryProps} />
        </div>
      )}
    </div>
  );
};

export default CheckoutOrderPanel;
