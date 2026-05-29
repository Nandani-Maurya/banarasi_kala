import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../utils/api";
import { getOrderDisplayNumber } from "../../utils/itemCode";
import { useNotification } from "../../context/NotificationContext";
import "./OrderConfirmation.css";

const toNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const formatPrice = (value) => `Rs. ${toNumber(value).toLocaleString("en-IN")}`;

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const getItemImage = (item) => item.image_url || item.product_image_url || "";
const getItemColor = (item) => item.color_name || item.Color?.name || "Selected color";

const getBreakdown = (order = {}) => {
  const items = order.OrderItems || [];
  const itemSubtotal = items.reduce((sum, item) => sum + toNumber(item.price) * Math.max(1, toNumber(item.quantity) || 1), 0);
  const subtotal = toNumber(order.subtotal_amount) || itemSubtotal;
  const shippingCharge = toNumber(order.shipping_charge);
  const shippingDiscount = toNumber(order.shipping_discount);
  const paymentFee = toNumber(order.payment_fee);
  const paymentDiscount = toNumber(order.payment_discount);
  const couponDiscount = toNumber(order.discount_amount);
  const walletAmount = toNumber(order.wallet_amount);
  const payable = toNumber(order.payable_amount) || toNumber(order.total_amount) || Math.max(
    0,
    subtotal + shippingCharge + paymentFee - shippingDiscount - paymentDiscount - couponDiscount - walletAmount,
  );

  return { subtotal, shippingCharge, shippingDiscount, paymentFee, paymentDiscount, couponDiscount, walletAmount, payable };
};

const canCancelOrder = (order) => {
  const status = String(order?.status || "").toLowerCase();
  if (!order?.createdAt || ["cancelled", "seller cancelled", "delivered", "shipped", "out for delivery", "rto delivered"].includes(status) || status.startsWith("rto ")) return false;
  const createdAt = new Date(order.createdAt).getTime();
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 24 * 60 * 60 * 1000;
};

const getCustomerOrderStatusLabel = (status) => {
  const normalized = String(status || "Pending").toLowerCase();
  if (normalized === "seller cancelled") return "Cancelled by seller";
  if (normalized === "rto delivered") return "Order returned to seller";
  if (normalized === "rto initiated" || normalized === "rto in transit") return "Returning to seller";
  if (normalized === "undelivered") return "Delivery attempt failed";
  if (normalized === "awb assigned") return "AWB assigned";
  return status || "Pending";
};

const buildTimeline = (order, tracking) => {
  const status = String(order?.status || "Pending").toLowerCase();
  const activities = tracking?.tracking?.tracking_data?.shipment_track_activities || [];
  if (activities.length) {
    return activities.map((activity, index) => ({
      title: activity.activity || "Shipment update",
      detail: [activity.location, activity.date].filter(Boolean).join(" • "),
      active: index === 0,
      icon: index === 0 ? "lucide:radio" : "lucide:circle",
    }));
  }

  return [
    {
      title: "Order placed",
      detail: `${formatDate(order?.createdAt)} • Confirmation email sent`,
      active: true,
      icon: "lucide:check-circle-2",
    },
    {
      title: status === "processing" ? "Preparation in progress" : "Artisan preparation",
      detail: "Quality check and packing before dispatch",
      active: ["processing", "awb assigned", "shipped", "out for delivery", "delivered", "undelivered", "rto initiated", "rto in transit", "rto delivered", "seller cancelled"].includes(status),
      icon: "lucide:package",
    },
    {
      title: "Shipped",
      detail: order?.shiprocket_awb ? `AWB ${order.shiprocket_awb}` : "Tracking appears after dispatch",
      active: ["awb assigned", "shipped", "out for delivery", "delivered", "undelivered", "rto initiated", "rto in transit", "rto delivered", "seller cancelled"].includes(status),
      icon: "lucide:truck",
    },
    {
      title: "Out for delivery",
      detail: "Courier will attempt delivery at your address",
      active: ["out for delivery", "delivered", "undelivered", "rto initiated", "rto in transit", "rto delivered", "seller cancelled"].includes(status),
      icon: "lucide:navigation",
    },
    ...(status.includes("rto") || status === "undelivered" || status === "seller cancelled" ? [{
      title: status === "rto delivered" || status === "seller cancelled" ? "Order returned to seller" : "Returning to seller",
      detail: order?.refund_note || "The courier could not complete delivery.",
      active: ["rto initiated", "rto in transit", "rto delivered", "seller cancelled"].includes(status),
      icon: "lucide:warehouse",
    }] : []),
    {
      title: "Delivered",
      detail: order?.delivered_at ? formatDate(order.delivered_at) : "Final delivery scan pending",
      active: status === "delivered",
      icon: "lucide:badge-check",
    },
  ];
};

const CANCEL_REASONS = [
  "Incorrect item/size selected",
  "Ordered by mistake / Duplicate order",
  "Delivery time is too long",
  "Decided to buy another product",
  "Applied wrong coupon code / Forgot discount",
  "Payment or billing issue",
  "Other reason"
];

export default function OrderConfirmation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const orderId = searchParams.get("orderId");
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [cancelModal, setCancelModal] = useState({
    isOpen: false,
    orderId: null,
    itemName: ""
  });
  const [cancelForm, setCancelForm] = useState({
    reason: "Incorrect item/size selected",
    comments: ""
  });
  const [modalSubmitLoading, setModalSubmitLoading] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, item: null });
  const [feedbackForm, setFeedbackForm] = useState({ rating: 5, title: "", comment: "", images: [] });
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  const breakdown = useMemo(() => getBreakdown(order || {}), [order]);
  const timeline = useMemo(() => buildTimeline(order, tracking), [order, tracking]);
  const cancellationAvailable = canCancelOrder(order);
  const orderNumber = getOrderDisplayNumber(order);
  const canReview = String(order?.status || "").toLowerCase() === "delivered";

  useEffect(() => {
    let cancelled = false;
    const loadOrder = async () => {
      if (!orderId) {
        setError("Order details are missing.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const response = await api.get(`/api/orders/${orderId}`);
        if (cancelled) return;
        setOrder(response.data);

        try {
          const trackRes = await api.get(`/api/orders/track/${orderId}`);
          if (!cancelled) setTracking(trackRes.data);
        } catch {
          if (!cancelled) setTracking(null);
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || "Unable to load order details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadOrder();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const handleCancelClick = () => {
    setCancelModal({
      isOpen: true,
      orderId: order.id,
      itemName: `Order ${orderNumber}`
    });
    setCancelForm({
      reason: CANCEL_REASONS[0],
      comments: ""
    });
  };

  const openFeedbackModal = (item) => {
    setFeedbackModal({ isOpen: true, item });
    setFeedbackForm({ rating: 5, title: "", comment: "", images: [] });
  };

  const closeFeedbackModal = () => {
    if (feedbackSubmitting) return;
    setFeedbackModal({ isOpen: false, item: null });
    setFeedbackForm({ rating: 5, title: "", comment: "", images: [] });
  };

  const submitFeedback = async (event) => {
    event.preventDefault();
    const item = feedbackModal.item;
    if (!item || !order?.id) return;
    if (feedbackForm.comment.trim().length < 8) {
      showNotification("Please write a short product review.", "warning");
      return;
    }

    const formData = new FormData();
    formData.append("orderId", order.id);
    formData.append("orderItemId", item.id);
    formData.append("productId", item.product_id);
    formData.append("rating", feedbackForm.rating);
    formData.append("title", feedbackForm.title.trim());
    formData.append("comment", feedbackForm.comment.trim());
    feedbackForm.images.forEach((file) => formData.append("images", file));

    setFeedbackSubmitting(true);
    try {
      const response = await api.post("/api/feedback/submit", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showNotification(response.data?.message || "Review submitted for approval.", "success");
      closeFeedbackModal();
      const updated = await api.get(`/api/orders/${orderId}`);
      setOrder(updated.data);
    } catch (error) {
      showNotification(error?.response?.data?.message || "Could not submit review right now.", "error");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setModalSubmitLoading(true);
    const { orderId } = cancelModal;
    const finalReason = cancelForm.comments.trim() 
      ? `${cancelForm.reason} - ${cancelForm.comments.trim()}`
      : cancelForm.reason;

    try {
      const response = await api.post(`/api/orders/${orderId}/cancel`, { reason: finalReason });
      setOrder(response.data.order || order);
      setCancelModal({ isOpen: false, orderId: null, itemName: "" });
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to cancel order.");
    } finally {
      setModalSubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="order-confirmation-page">
        <div className="order-confirmation-state">
          <span className="order-loader" />
          <p>Loading your order details...</p>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="order-confirmation-page">
        <div className="order-confirmation-state">
          <Icon icon="lucide:alert-circle" />
          <h1>Order details unavailable</h1>
          <p>{error || "Please check My Orders for the latest details."}</p>
          <button type="button" onClick={() => navigate("/my-orders")}>Go to My Orders</button>
        </div>
      </main>
    );
  }

  return (
    <main className="order-confirmation-page">
      <section className="order-success-hero">
        <span className="order-success-icon"><Icon icon="lucide:check" /></span>
        <div>
          <p>Order confirmed</p>
          <h1>Order {orderNumber}</h1>
          <span>Placed on {formatDate(order.createdAt)}. A confirmation email has been sent to {order.customer_email}.</span>
        </div>
      </section>

      <section className="order-confirmation-grid">
        <div className="order-confirmation-main">
          <section className="order-panel">
            <div className="order-panel-head">
              <h2>Shipment timeline</h2>
              <span>{getCustomerOrderStatusLabel(order.status)}</span>
            </div>
            <div className="confirmation-timeline">
              {timeline.map((step, index) => (
                <div key={`${step.title}-${index}`} className={`confirmation-step ${step.active ? "is-active" : ""}`}>
                  <span className="confirmation-step-icon"><Icon icon={step.icon} /></span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            {order.shiprocket_awb && (
              <div className="awb-strip">
                <span>AWB</span>
                <strong>{order.shiprocket_awb}</strong>
              </div>
            )}
          </section>

          <section className="order-panel">
            <div className="order-panel-head">
              <h2>Items</h2>
              <span>{(order.OrderItems || []).length} item(s)</span>
            </div>
            <div className="confirmation-items">
              {(order.OrderItems || []).map((item, index) => {
                const productUrl = item.product_slug ? `/product/${item.product_slug}` : null;
                return (
                <article className="confirmation-item" key={`${item.product_id}-${item.colorId || index}`}>
                  {productUrl ? (
                    <Link to={productUrl} className="confirmation-item-media" aria-label={`Open ${item.product_name}`}>
                      {getItemImage(item) ? <img src={getItemImage(item)} alt={item.product_name} /> : <Icon icon="lucide:image-off" />}
                    </Link>
                  ) : (
                    <div className="confirmation-item-media">
                      {getItemImage(item) ? <img src={getItemImage(item)} alt={item.product_name} /> : <Icon icon="lucide:image-off" />}
                    </div>
                  )}
                  <div>
                    {productUrl ? <Link to={productUrl} className="confirmation-product-link"><h3>{item.product_name}</h3></Link> : <h3>{item.product_name}</h3>}
                    <p>{getItemColor(item)} - Qty {item.quantity}{item.sku ? ` - SKU: ${item.sku}` : ""}</p>
                    <span>{formatPrice(item.price)} each</span>
                    {item.shipping_meta?.refund_rules && (
                      <small>
                        Return deduction: {formatPrice(item.shipping_meta.refund_rules.return_delivery_deduction)} delivery charge. Exchange: no deduction.
                      </small>
                    )}
                    {canReview && (
                      item.feedback ? (
                        <small className="confirmation-feedback-note">
                          Review {item.feedback.is_approved ? "published" : "pending approval"} - {item.feedback.rating}/5
                        </small>
                      ) : (
                        <button className="confirmation-feedback-btn" type="button" onClick={() => openFeedbackModal(item)}>
                          Add Feedback
                        </button>
                      )
                    )}
                  </div>
                  <strong>{formatPrice(toNumber(item.price) * Math.max(1, toNumber(item.quantity) || 1))}</strong>
                </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="order-confirmation-side">
          <section className="order-panel">
            <h2>Payment summary</h2>
            <div className="summary-row"><span>Product total</span><strong>{formatPrice(breakdown.subtotal)}</strong></div>
            <div className="summary-row"><span>Delivery charge</span><strong>{formatPrice(breakdown.shippingCharge)}</strong></div>
            {breakdown.shippingDiscount > 0 && <div className="summary-row is-saving"><span>Free shipping</span><strong>-{formatPrice(breakdown.shippingDiscount)}</strong></div>}
            {breakdown.paymentDiscount > 0 && <div className="summary-row is-saving"><span>Payment discount</span><strong>-{formatPrice(breakdown.paymentDiscount)}</strong></div>}
            {breakdown.paymentFee > 0 && <div className="summary-row"><span>COD charge</span><strong>{formatPrice(breakdown.paymentFee)}</strong></div>}
            {breakdown.couponDiscount > 0 && <div className="summary-row is-saving"><span>Coupon{order.coupon_code ? ` (${order.coupon_code})` : ""}</span><strong>-{formatPrice(breakdown.couponDiscount)}</strong></div>}
            {breakdown.walletAmount > 0 && <div className="summary-row is-saving"><span>Wallet used</span><strong>-{formatPrice(breakdown.walletAmount)}</strong></div>}
            <div className="summary-row is-final"><span>Final amount</span><strong>{formatPrice(breakdown.payable)}</strong></div>
            <div className="payment-tags">
              <span>{order.payment_method || "Prepaid"}</span>
              <span>{order.payment_status || "Paid"}</span>
            </div>
          </section>

          <section className="order-panel">
            <h2>Delivery address</h2>
            <p className="address-copy">{order.customer_name}<br />{order.address}<br />{order.city}, {order.state} - {order.pincode}<br />Phone: {order.phone}</p>
          </section>

          <section className="order-panel">
            <h2>Need to cancel?</h2>
            <p className="policy-copy">
              You can cancel within 24 hours or until the order is shipped. Once shipped, live tracking will continue here and in My Orders.
            </p>
            {cancellationAvailable ? (
              <button className="cancel-order-btn" type="button" onClick={handleCancelClick}>
                Cancel order
              </button>
            ) : (
              <span className="cancel-disabled-note">Cancellation is closed for this order.</span>
            )}
          </section>

          <Link className="continue-shopping-link" to="/collection">
            <Icon icon="lucide:shopping-bag" />
            Continue shopping
          </Link>
        </aside>
      </section>

      {feedbackModal.isOpen && (
        <div className="cancel-modal-overlay">
          <div className="cancel-modal-container feedback-detail-modal">
            <button type="button" className="cancel-modal-close" onClick={closeFeedbackModal} disabled={feedbackSubmitting}>
              <Icon icon="lucide:x" />
            </button>
            <div className="cancel-modal-header">
              <h3>Complete your Feedback</h3>
              <p>Share your experience for <strong>{feedbackModal.item?.product_name}</strong>.</p>
            </div>

            <form onSubmit={submitFeedback} className="cancel-modal-form">
              <div className="form-group">
                <label>Rating</label>
                <div className="confirmation-rating-picker">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={feedbackForm.rating >= star ? "active" : ""}
                      onClick={() => setFeedbackForm((current) => ({ ...current, rating: star }))}
                    >
                      <Icon icon="mdi:star" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="feedback-title">Short title (optional)</label>
                <input
                  id="feedback-title"
                  type="text"
                  maxLength={120}
                  value={feedbackForm.title}
                  onChange={(event) => setFeedbackForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Loved the fabric"
                />
              </div>

              <div className="form-group">
                <label htmlFor="feedback-comment">Product review</label>
                <textarea
                  id="feedback-comment"
                  rows={5}
                  required
                  value={feedbackForm.comment}
                  onChange={(event) => setFeedbackForm((current) => ({ ...current, comment: event.target.value }))}
                  placeholder="Write what you liked about this product..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="feedback-images">Upload photos (optional)</label>
                <input
                  id="feedback-images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []).slice(0, 5);
                    setFeedbackForm((current) => ({ ...current, images: files }));
                  }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="modal-action-btn secondary" onClick={closeFeedbackModal} disabled={feedbackSubmitting}>
                  Go Back
                </button>
                <button type="submit" className="modal-action-btn primary" disabled={feedbackSubmitting}>
                  {feedbackSubmitting ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cancelModal.isOpen && (
        <div className="cancel-modal-overlay">
          <div className="cancel-modal-container">
            <button 
              type="button"
              className="cancel-modal-close" 
              onClick={() => setCancelModal({ isOpen: false, orderId: null, itemName: "" })}
            >
              <Icon icon="lucide:x" />
            </button>
            <div className="cancel-modal-header">
              <h3>Confirm Cancellation</h3>
              <p>Please specify reason for cancelling <strong>{cancelModal.itemName}</strong></p>
            </div>
            
            <form onSubmit={handleModalSubmit} className="cancel-modal-form">
              <div className="form-group">
                <label htmlFor="cancel-reason">Select Reason</label>
                <select 
                  id="cancel-reason" 
                  value={cancelForm.reason} 
                  onChange={(e) => setCancelForm(prev => ({ ...prev, reason: e.target.value }))}
                  required
                >
                  {CANCEL_REASONS.map((r, i) => (
                    <option key={i} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="cancel-comments">Additional Comments (Optional)</label>
                <textarea
                  id="cancel-comments"
                  placeholder="Bhai, details yahan likh sakte ho (optional)..."
                  value={cancelForm.comments}
                  onChange={(e) => setCancelForm(prev => ({ ...prev, comments: e.target.value }))}
                  rows={4}
                />
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="modal-action-btn secondary"
                  onClick={() => setCancelModal({ isOpen: false, orderId: null, itemName: "" })}
                  disabled={modalSubmitLoading}
                >
                  Go Back
                </button>
                <button 
                  type="submit" 
                  className="modal-action-btn danger"
                  disabled={modalSubmitLoading}
                >
                  {modalSubmitLoading ? "Processing..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
