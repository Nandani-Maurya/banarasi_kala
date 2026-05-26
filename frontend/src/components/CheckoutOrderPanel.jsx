import { Icon } from "@iconify/react";
import CheckoutReviewSummary from "./CheckoutReviewSummary";
import "./CheckoutOrderPanel.css";

const CheckoutOrderPanel = ({
  step = "details",
  addresses = [],
  selectedAddressId = "",
  onSelectAddress,
  onAddAddress,
  onEditAddress,
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
                <p className="buy-now-muted">Loading saved addresses...</p>
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
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          onEditAddress?.(address);
                        }}
                      >
                        Edit
                      </button>
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
          <section className="buy-now-section checkout-section">
            <div className="buy-now-section-title">
              <h3>{reviewTitle}</h3>
              <button type="button" onClick={onEditDetails}>
                <Icon icon="lucide:arrow-left" />
                Edit
              </button>
            </div>
            <div className="checkout-review-grid">
              {reviewItems.length > 0 && (
                <div className="checkout-review-panel">
                  <span>Products</span>
                  {reviewItems.map((item) => (
                    <div key={item.key} className={`checkout-review-product ${item.unavailable ? "unavailable" : ""}`}>
                      {item.image && <img src={item.image} alt="" />}
                      <div>
                        <strong>{item.name}</strong>
                        {item.meta && <small>{item.meta}</small>}
                        {item.unavailable && <small className="checkout-review-unavailable">{item.unavailableLabel || "Unavailable - excluded from total"}</small>}
                      </div>
                      <b>{item.total}</b>
                    </div>
                  ))}
                </div>
              )}
              {reviewAddress && (
                <div className="checkout-review-panel">
                  <span>Deliver to</span>
                  <strong>{reviewAddress.name}</strong>
                  <p>{reviewAddress.line}</p>
                  <small>{reviewAddress.phone}</small>
                </div>
              )}
              {reviewPayment && (
                <div className="checkout-review-panel">
                  <span>Payment</span>
                  <strong>{reviewPayment.title}</strong>
                  <p>{reviewPayment.description}</p>
                </div>
              )}
            </div>
          </section>
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
