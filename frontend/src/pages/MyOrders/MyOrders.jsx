import { Icon } from "@iconify/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { imgUrl } from "../../utils/cloudinary";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import api from "../../utils/api";
import { formatEstimatedDeliveryDate, getEstimatedDeliveryDate } from "../../utils/deliveryDate";
import { getOrderDisplayNumber } from "../../utils/itemCode";
import { numberEnv } from "../../utils/env";
import EmptyStateIcon from "../../components/EmptyStateIcon";
import "./MyOrders.css";

const STATUS_CONFIG = {
  "Order Placed": { color: "#8a5a00", bg: "#fff6dc", icon: "lucide:clock-3", label: "Order placed" },
  Pending: { color: "#8a5a00", bg: "#fff6dc", icon: "lucide:clock-3", label: "Order placed" },
  "Picked Up": { color: "#6840aa", bg: "#f5f0ff", icon: "lucide:package-check", label: "Picked up" },
  Shipped: { color: "#6840aa", bg: "#f5f0ff", icon: "lucide:truck", label: "Shipped" },
  Delivered: { color: "#087a55", bg: "#edfdf5", icon: "lucide:check-circle", label: "Delivered" },
  Cancelled: { color: "#b42318", bg: "#fff0ee", icon: "lucide:x-circle", label: "Cancelled" },
  "Out For Delivery": { color: "#9a6200", bg: "#fff6dc", icon: "lucide:navigation", label: "Out for delivery" },
  Undelivered: { color: "#9a6200", bg: "#fff6dc", icon: "lucide:triangle-alert", label: "Delivery attempt failed" },
  "RTO Initiated": { color: "#9a6200", bg: "#fff6dc", icon: "lucide:undo-2", label: "Returning to seller" },
  "RTO In Transit": { color: "#9a6200", bg: "#fff6dc", icon: "lucide:truck", label: "Returning to seller" },
  "RTO Delivered": { color: "#7a3d00", bg: "#fff4e8", icon: "lucide:warehouse", label: "Order returned to seller" },
  "Seller Cancelled": { color: "#b42318", bg: "#fff0ee", icon: "lucide:x-circle", label: "Cancelled by seller" },
  "Re-dispatch Requested": { color: "#2454a6", bg: "#eff5ff", icon: "lucide:repeat-2", label: "Re-dispatch requested" },
  "Re-dispatch Payment Pending": { color: "#8a5a00", bg: "#fff6dc", icon: "lucide:credit-card", label: "Re-dispatch payment pending" },
  "Re-dispatch Paid": { color: "#087a55", bg: "#edfdf5", icon: "lucide:badge-check", label: "Re-dispatch paid" },
  "Re-dispatched": { color: "#6840aa", bg: "#f5f0ff", icon: "lucide:truck", label: "Re-dispatched" },
  "Return Requested": { color: "#9a6200", bg: "#fff6dc", icon: "lucide:rotate-ccw", label: "Return requested" },
  "Return Initiated": { color: "#9a6200", bg: "#fff6dc", icon: "lucide:rotate-ccw", label: "Return initiated" },
  "Out For Return Pickup": { color: "#9a6200", bg: "#fff6dc", icon: "lucide:navigation", label: "Return pickup" },
  "Return Picked Up": { color: "#6840aa", bg: "#f5f0ff", icon: "lucide:package-check", label: "Return picked up" },
  "Return Completed": { color: "#087a55", bg: "#edfdf5", icon: "lucide:badge-check", label: "Return completed" },
  "Exchange Requested": { color: "#2454a6", bg: "#eff5ff", icon: "lucide:repeat-2", label: "Exchange requested" },
  "Exchange Initiated": { color: "#2454a6", bg: "#eff5ff", icon: "lucide:repeat-2", label: "Exchange initiated" },
  "Exchange Pickup Scheduled": { color: "#9a6200", bg: "#fff6dc", icon: "lucide:calendar-clock", label: "Exchange pickup scheduled" },
  "Exchange Picked Up": { color: "#6840aa", bg: "#f5f0ff", icon: "lucide:package-check", label: "Exchange picked up" },
  "Exchange Completed": { color: "#087a55", bg: "#edfdf5", icon: "lucide:badge-check", label: "Exchange completed" },
};

const getStatus = (status) => {
  if (!status) return STATUS_CONFIG.Pending;
  const normalized = String(status).toLowerCase();
  if (normalized === "order placed" || normalized === "order_placed") return STATUS_CONFIG["Order Placed"];
  if (normalized === "pending") return STATUS_CONFIG.Pending;
  if (normalized === "processing") return STATUS_CONFIG["Order Placed"];
  if (normalized === "picked up" || normalized === "picked_up" || normalized === "awb assigned" || normalized === "awb_assigned") return STATUS_CONFIG["Picked Up"];
  if (normalized === "shipped" || normalized.includes("in transit") || normalized.includes("manifest")) return STATUS_CONFIG.Shipped;
  if (normalized === "delivered") return STATUS_CONFIG.Delivered;
  if (normalized === "cancelled") return STATUS_CONFIG.Cancelled;
  if (normalized.includes("cancel")) return STATUS_CONFIG.Cancelled;
  if (normalized === "out for delivery" || normalized === "out_for_delivery") return STATUS_CONFIG["Out For Delivery"];
  if (normalized === "undelivered") return STATUS_CONFIG.Undelivered;
  if (normalized === "rto initiated" || normalized === "rto_initiated") return STATUS_CONFIG["RTO Initiated"];
  if (normalized === "rto in transit" || normalized === "rto_in_transit") return STATUS_CONFIG["RTO In Transit"];
  if (normalized === "rto delivered" || normalized === "rto_delivered") return STATUS_CONFIG["RTO Delivered"];
  if (normalized === "seller cancelled" || normalized === "seller_cancelled") return STATUS_CONFIG["Seller Cancelled"];
  if (normalized.includes("return requested")) return STATUS_CONFIG["Return Requested"];
  if (normalized.includes("return initiated")) return STATUS_CONFIG["Return Initiated"];
  if (normalized.includes("out for return pickup")) return STATUS_CONFIG["Out For Return Pickup"];
  if (normalized.includes("return picked up")) return STATUS_CONFIG["Return Picked Up"];
  if (normalized.includes("return completed") || normalized.includes("return delivered")) return STATUS_CONFIG["Return Completed"];
  if (normalized.includes("exchange requested")) return STATUS_CONFIG["Exchange Requested"];
  if (normalized.includes("exchange initiated")) return STATUS_CONFIG["Exchange Initiated"];
  if (normalized.includes("exchange pickup scheduled")) return STATUS_CONFIG["Exchange Pickup Scheduled"];
  if (normalized.includes("exchange picked up")) return STATUS_CONFIG["Exchange Picked Up"];
  if (normalized.includes("exchange completed") || normalized.includes("exchange delivered")) return STATUS_CONFIG["Exchange Completed"];
  
  return STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
};

const toNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};
const formatPrice = (value) => `Rs. ${toNumber(value).toLocaleString("en-IN")}`;
const getItemImage = (item) => item.image_url || item.product_image_url || "";
const getItemColorLabel = (item) => item.color_name || item.Color?.name || null;
const isCancelled = (order) => ["cancelled", "seller cancelled"].includes(String(order.status || "").toLowerCase());
const PRE_DELIVERY_STATUSES = new Set([
  "pending",
  "order placed",
  "order_placed",
  "processing",
  "picked up",
  "picked_up",
  "awb assigned",
  "awb_assigned",
  "shipped",
  "out for delivery",
  "out_for_delivery",
  "undelivered",
  "rto initiated",
  "rto_initiated",
  "rto in transit",
  "rto_in_transit",
]);
const isDelivered = (order) => {
  const status = String(order?.status || "").toLowerCase();
  if (PRE_DELIVERY_STATUSES.has(status)) return false;
  return status === "delivered" || Boolean(order?.delivered_at);
};
const canReviewOrderItem = (order, item) => {
  const itemStatus = String(item?.status || "").toLowerCase();
  return isDelivered(order) && !itemStatus.includes("cancel");
};
const getItemDisplayStatus = (order, item) => {
  const itemStatus = String(item?.status || "").trim();
  if (itemStatus && itemStatus.toLowerCase() !== "active") return itemStatus;
  return getStatus(order?.status).label;
};

const FILTER_OPTIONS = [
  { id: "all", label: "All" },
  { id: "ordered", label: "Ordered" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "exchange", label: "Exchange" },
  { id: "return", label: "Return" },
];

const getOrderFilterGroup = (status = "") => {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("exchange")) return "exchange";
  if (normalized.includes("return")) return "return";
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("delivered")) return "delivered";
  if (normalized.includes("ship") || normalized.includes("awb") || normalized.includes("out for delivery")) return "shipped";
  return "ordered";
};

const getOrderBreakdown = (order) => {
  const items = order.OrderItems || [];
  const activeItems = items.filter(item => String(item.status || "").toLowerCase() !== "cancelled");
  const itemSubtotal = activeItems.reduce(
    (sum, item) => sum + toNumber(item.price) * Math.max(1, toNumber(item.quantity) || 1),
    0,
  );
  const subtotal = toNumber(order.subtotal_amount) || itemSubtotal;
  const shippingCharge = toNumber(order.shipping_charge);
  const shippingDiscount = toNumber(order.shipping_discount);
  const paymentFee = toNumber(order.payment_fee);
  const platformFeeAmount = numberEnv("VITE_PLATFORM_FEE_AMOUNT");
  const hasCod = String(order.payment_method).toUpperCase() === "COD";

  let codCharge = 0;
  let platformFee = 0;

  if (paymentFee > 0) {
    if (hasCod) {
      codCharge = Math.max(0, paymentFee - platformFeeAmount);
      platformFee = platformFeeAmount;
    } else {
      codCharge = 0;
      platformFee = paymentFee;
    }
  }

  const paymentDiscount = toNumber(order.payment_discount);
  const couponDiscount = toNumber(order.discount_amount);
  const walletAmount = toNumber(order.wallet_amount);
  const payable = toNumber(order.payable_amount) || toNumber(order.total_amount) || Math.max(
    0,
    subtotal + shippingCharge + paymentFee - shippingDiscount - paymentDiscount - couponDiscount - walletAmount,
  );

  return {
    subtotal,
    shippingCharge,
    shippingDiscount,
    paymentFee,
    codCharge,
    platformFee,
    paymentDiscount,
    couponDiscount,
    walletAmount,
    payable,
    paymentMethod: order.payment_method || "Prepaid",
    paymentStatus: order.payment_status || (String(order.payment_method).toUpperCase() === "COD" ? "Pending" : "Paid"),
  };
};

const canCancelOrder = (order) => {
  const rawDate = order?.createdAt || order?.created_at;
  if (!rawDate) return false;
  const status = String(order.status || "").toLowerCase();
  if (["cancelled", "seller cancelled", "delivered", "shipped", "out for delivery", "rto delivered"].includes(status) || status.startsWith("rto ")) return false;
  const createdAt = new Date(rawDate).getTime();
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt <= 24 * 60 * 60 * 1000;
};

const TrackingTimeline = ({ activities = [] }) => {
  if (!activities.length) {
    return (
      <div className="tracking-empty">
        <Icon icon="lucide:map-pin-off" />
        <p>Tracking updates will appear once shipment is dispatched.</p>
      </div>
    );
  }

  return (
    <div className="tracking-timeline">
      {activities.map((activity, index) => (
        <div key={`${activity.activity || "step"}-${index}`} className={`timeline-item ${index === 0 ? "active" : ""}`}>
          <span className="timeline-dot" />
          {index < activities.length - 1 && <span className="timeline-line" />}
          <div className="timeline-content">
            <p className="timeline-status">{activity.activity}</p>
            <p className="timeline-location">{activity.location}</p>
            <p className="timeline-date">{activity.date}</p>
          </div>
        </div>
      ))}
    </div>
  );
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

const RETURN_REASONS = [
  "Size fits differently than expected / Size issue",
  "Product color/design is different from images",
  "Received damaged or defective product",
  "Quality of material is not as expected",
  "Wrong product delivered",
  "Changed mind / No longer needed",
  "Other reason"
];

const EXCHANGE_REASONS = [
  "Need a different color/design"
];

const CANCEL_RETURN_REASONS = [
  "Decided to keep the product / Changed mind",
  "Resolved the issue myself",
  "Product size/fit is fine now",
  "Other reason"
];

const CANCEL_EXCHANGE_REASONS = [
  "Decided to keep the product / Changed mind",
  "Resolved the issue myself",
  "Product color/design is fine now",
  "Other reason"
];

const RATING_LABELS = ["Very Bad", "Bad", "Ok-Ok", "Good", "Very Good"];

const ReviewStars = ({ rating = 0, onSelect, disabled = false }) => (
  <div className="order-review-stars">
    {[1, 2, 3, 4, 5].map((star, index) => (
      <button
        key={star}
        type="button"
        className={Number(rating) >= star ? "active" : ""}
        onClick={() => onSelect?.(star)}
        disabled={disabled}
        aria-label={`${star} star`}
      >
        <Icon icon="mdi:star" />
        <small>{RATING_LABELS[index]}</small>
      </button>
    ))}
  </div>
);

const OrderCard = ({ order, onFeedback }) => {
  const navigate = useNavigate();

  const orderNumber = getOrderDisplayNumber(order);
  const statusMeta = getStatus(order.status);
  const items = order.OrderItems || [];
  const activeItems = useMemo(() => items.filter(item => String(item.status || "").toLowerCase() !== "cancelled"), [items]);
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const openOrderDetail = () => {
    navigate(`/order-confirmation?orderId=${order.id}`);
  };

  return (
    <article className={`order-card ${isCancelled(order) ? "is-cancelled" : ""}`}>
      <div className="order-card-header">
        <div className="order-meta">
          <span className="order-number">#{orderNumber}</span>
          <span className="order-date">{orderDate}</span>
        </div>
        <span className="order-status-badge" style={{ backgroundColor: statusMeta.bg, color: statusMeta.color }}>
          <Icon icon={statusMeta.icon} />
          {statusMeta.label}
        </span>
        <button className="order-detail-arrow" type="button" onClick={openOrderDetail} aria-label={`Open order ${orderNumber}`}>
          <Icon icon="lucide:chevron-right" />
        </button>
      </div>

      <div className="order-products">
        <div className="order-products-title">
          <span>Items</span>
          <small>{activeItems.length} {activeItems.length === 1 ? "item" : "items"}</small>
        </div>

        {items.map((item, index) => {
          const imageUrl = getItemImage(item);
          const colorHex = item.color_hex || null;
          const productName = item.product_name || `Product #${item.product_id}`;
          const isItemCancelled = String(item.status || "").toLowerCase() === "cancelled";
          const itemRating = Number(item.feedback?.rating || 0);
          const productUrl = item.product_slug
            ? `/product/${item.product_slug}${item.colorId ? `?color=${item.colorId}` : ""}`
            : null;

          return (
            <div
              key={`${item.product_id}-${item.colorId || index}`}
              className={`order-product-item ${isItemCancelled ? "item-cancelled" : ""}${productUrl ? " is-clickable" : ""}`}
              onClick={productUrl ? () => navigate(productUrl) : undefined}
              role={productUrl ? "button" : undefined}
              tabIndex={productUrl ? 0 : undefined}
              onKeyDown={productUrl ? (e) => e.key === "Enter" && navigate(productUrl) : undefined}
            >
              <div className="order-product-media">
                {imageUrl ? (
                  <img src={imgUrl(imageUrl)} alt={productName} loading="lazy" />
                ) : (
                  <div className="order-product-placeholder">
                    <Icon icon="lucide:image-off" />
                  </div>
                )}
              </div>

              <div className="order-product-details">
                <h3>{productName}</h3>
                <div className="order-product-subline">
                  <span>Qty {item.quantity}</span>
                </div>
                {(colorHex || getItemColorLabel(item)) && (
                  <div className="order-product-color">
                    {colorHex && <span className="order-color-swatch" style={{ backgroundColor: colorHex }} />}
                    {getItemColorLabel(item) && <span>{getItemColorLabel(item)}</span>}
                  </div>
                )}
                {String(item?.status || "").trim().toLowerCase() !== "active" && item?.status && (
                  <span className="order-item-status">{getItemDisplayStatus(order, item)}</span>
                )}
              </div>
              {canReviewOrderItem(order, item) && (
                <div className="order-feedback-row">
                  <ReviewStars rating={itemRating} disabled />
                  <button type="button" onClick={(e) => { e.stopPropagation(); onFeedback(order, item); }}>
                    {item.feedback ? "Edit feedback" : "Add feedback"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(() => {
        const isPrepaid = String(order.payment_method || '').toUpperCase() !== 'COD';
        const hasCompletedReturn = String(order.status || '').toLowerCase().includes('return completed') || 
          items.some(item => String(item.status || '').toLowerCase().includes('return completed'));
        if (isPrepaid && hasCompletedReturn) {
          let totalItemAmount = 0;
          let totalForwardDeduction = 0;
          let totalReverseDeduction = 0;
          let returnActionsFound = false;

          items.forEach(item => {
            const itemActions = Array.isArray(item.actions) ? item.actions : [];
            itemActions.forEach(action => {
              const actionType = String(action.action_type || '').toLowerCase();
              if (actionType === 'return') {
                totalItemAmount += Number(action.item_amount || 0);
                totalForwardDeduction += Number(action.forward_shipping_deduction || 0);
                totalReverseDeduction += Number(action.reverse_shipping_deduction || 0);
                returnActionsFound = true;
              }
            });
          });

          // Fallbacks for legacy/older order formats
          if (!returnActionsFound || totalItemAmount === 0) {
            totalItemAmount = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
            totalForwardDeduction = Number(order.shipping_charge || 0);
            totalReverseDeduction = 0;
          }

          const calculatedRefund = Math.max(0, totalItemAmount - totalForwardDeduction - totalReverseDeduction);
          const finalRefund = Number(order.refund_amount || calculatedRefund);

          return (
            <div className="order-card-refund-box">
              <div className="refund-box-header">
                <Icon icon="lucide:badge-indian-rupee" />
                <h4>Refund Breakdown</h4>
              </div>

              <div className="refund-breakdown-details">
                <div className="refund-detail-row">
                  <span>Returned Items Value:</span>
                  <span>{formatPrice(totalItemAmount)}</span>
                </div>
                {totalForwardDeduction > 0 && (
                  <div className="refund-detail-row deduction">
                    <span>Delivery Charges Deduction:</span>
                    <span>-{formatPrice(totalForwardDeduction)}</span>
                  </div>
                )}
                {totalReverseDeduction > 0 && (
                  <div className="refund-detail-row deduction">
                    <span>RTO / Reverse Shipping Charges:</span>
                    <span>-{formatPrice(totalReverseDeduction)}</span>
                  </div>
                )}
                <div className="refund-detail-row final-refund">
                  <span>Total Refund Processed:</span>
                  <strong>{formatPrice(finalRefund)}</strong>
                </div>
              </div>

              <p className="refund-box-note">
                <Icon icon="lucide:info" />
                Refund has been processed after successful quality check. Forward delivery charges and RTO/reverse shipping charges have been deducted from the original paid amount.
              </p>
            </div>
          );
        }
        return null;
      })()}
    </article>
  );
};

export default function MyOrders() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [draftFilter, setDraftFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [actionModal, setActionModal] = useState({
    isOpen: false,
    type: "cancel_order", // "cancel_order", "cancel_item", "return", "exchange"
    orderId: null,
    itemId: null,
    itemName: ""
  });
  const [actionForm, setActionForm] = useState({
    reason: "Incorrect item/size selected",
    comments: ""
  });
  const [modalSubmitLoading, setModalSubmitLoading] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    order: null,
    item: null,
    productName: "",
  });
  const [feedbackForm, setFeedbackForm] = useState({
    rating: 5,
    title: "",
    comment: "",
    images: [],
  });
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) =>
      selectedFilter === "all" || getOrderFilterGroup(order.status) === selectedFilter
    );
  }, [orders, selectedFilter]);

  const visibleOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return filteredOrders;
    return filteredOrders.filter((order) => {
      const orderNumber = getOrderDisplayNumber(order).toLowerCase();
      const productNames = (order.OrderItems || []).map((item) => item.product_name || "").join(" ").toLowerCase();
      return orderNumber.includes(query) || productNames.includes(query) || String(order.status || "").toLowerCase().includes(query);
    });
  }, [filteredOrders, searchQuery]);

  const fetchOrders = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/api/orders/my");
      const payload = response.data;
      const data = Array.isArray(payload) ? payload : (payload?.data || []);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleActionTrigger = ({ type, orderId, itemId = null, itemName }) => {
    let defaultReason = "";
    if (type === "cancel_return") defaultReason = CANCEL_RETURN_REASONS[0];
    else if (type === "cancel_exchange") defaultReason = CANCEL_EXCHANGE_REASONS[0];
    else if (type.startsWith("cancel")) defaultReason = CANCEL_REASONS[0];
    else if (type === "return") defaultReason = RETURN_REASONS[0];
    else if (type === "exchange") defaultReason = EXCHANGE_REASONS[0];

    setActionModal({
      isOpen: true,
      type,
      orderId,
      itemId,
      itemName
    });
    setActionForm({
      reason: defaultReason,
      comments: ""
    });
  };

  const handleFeedbackTrigger = (order, item) => {
    if (!canReviewOrderItem(order, item)) {
      showNotification("Product review is available after delivery.", "warning");
      return;
    }
    const productName = item.product_name || `Product #${item.product_id}`;
    setFeedbackModal({ isOpen: true, order, item, productName });
    setFeedbackForm({
      rating: Number(item.feedback?.rating || 5),
      title: item.feedback?.title || "",
      comment: item.feedback?.comment || "",
      images: [],
    });
  };

  const closeFeedbackModal = () => {
    if (feedbackSubmitting) return;
    setFeedbackModal({ isOpen: false, order: null, item: null, productName: "" });
    setFeedbackForm({ rating: 5, title: "", comment: "", images: [] });
  };

  const submitFeedback = async (event) => {
    event.preventDefault();
    const { order, item } = feedbackModal;
    if (!order?.id || !item?.id) return;
    if (!canReviewOrderItem(order, item)) {
      showNotification("Product review is available after delivery.", "warning");
      return;
    }
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
      const msg = response.data?.message?.toLowerCase().includes("updated") ? "Review updated" : "Review submitted";
      showNotification(msg, "success");
      closeFeedbackModal();
      fetchOrders();
    } catch (err) {
      showNotification(err?.response?.data?.message || "Could not submit review right now.", "error");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setModalSubmitLoading(true);
    const { type, orderId, itemId, itemName } = actionModal;
    const finalReason = actionForm.comments.trim() 
      ? `${actionForm.reason} - ${actionForm.comments.trim()}`
      : actionForm.reason;

    try {
      if (type === "cancel_item") {
        const currentOrder = orders.find((o) => String(o.id) === String(orderId));
        const orderItem = (currentOrder?.OrderItems || []).find((i) => String(i.id) === String(itemId));
        const response = await api.post(`/api/orders/${orderId}/item-actions/cancel`, {
          actionType: "cancel",
          items: [{ orderItemId: Number(itemId), quantity: Number(orderItem?.quantity || 1) }],
          reason: finalReason,
        });
        showNotification(response.data?.refund_message || `${itemName} cancelled successfully.`, "success");
      } else if (type === "cancel_order") {
        const currentOrder = orders.find((o) => String(o.id) === String(orderId));
        const activeItems = (currentOrder?.OrderItems || [])
          .filter((i) => !["Cancelled", "Returned", "Exchanged"].includes(i.status))
          .map((i) => ({ orderItemId: i.id, quantity: i.quantity }));
        const response = await api.post(`/api/orders/${orderId}/item-actions/cancel`, {
          actionType: "cancel",
          items: activeItems,
          reason: finalReason,
        });
        showNotification(response.data?.refund_message || "Order cancelled successfully.", "success");
      } else if (type === "return") {
        const response = await api.post("/api/shiprocket/create-return", { orderId, reason: finalReason });
        showNotification(response.data?.refund_message || "Return request submitted successfully.", "success");
      } else if (type === "exchange") {
        const response = await api.post("/api/shiprocket/create-exchange", { orderId, reason: finalReason });
        showNotification(response.data?.exchange_message || "Exchange request submitted successfully.", "success");
      } else if (type === "cancel_return") {
        await api.post("/api/shiprocket/cancel-return", { orderId, reason: finalReason });
        showNotification("Return request cancelled successfully.", "success");
      } else if (type === "cancel_exchange") {
        await api.post("/api/shiprocket/cancel-exchange", { orderId, reason: finalReason });
        showNotification("Exchange request cancelled successfully.", "success");
      }
      setActionModal({ isOpen: false, type: "cancel_order", orderId: null, itemId: null, itemName: "" });
      fetchOrders();
    } catch (err) {
      showNotification(err?.response?.data?.message || err.message || "Unable to process request.", "error");
    } finally {
      setModalSubmitLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      navigate("/login?refresh=my-orders");
      return;
    }
    fetchOrders();
  }, [user, navigate, fetchOrders]);

  const openFilterModal = () => {
    setDraftFilter(selectedFilter);
    setFilterOpen(true);
  };

  const applyFilter = () => {
    setSelectedFilter(draftFilter);
    setFilterOpen(false);
  };

  const clearFilter = () => {
    setDraftFilter("all");
    setSelectedFilter("all");
    setFilterOpen(false);
  };

  return (
    <div className="my-orders-page">
      <section className="orders-hero orders-hero--compact">
        <div className="orders-hero-content">
          <h1>My Orders</h1>
        </div>
      </section>

      <main className="orders-container">
        {!loading && !error && orders.length > 0 && (
          <div className="orders-search-row">
            <label>
              <Icon icon="lucide:search" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by product name or order number"
              />
              {searchQuery && (
                <button type="button" className="orders-search-clear" onClick={() => setSearchQuery("")} aria-label="Clear search">
                  <Icon icon="lucide:x" />
                </button>
              )}
            </label>
            <button type="button" onClick={openFilterModal}>
              <Icon icon="lucide:list-filter" />
              {FILTER_OPTIONS.find((item) => item.id === selectedFilter)?.label || "Filters"}
            </button>
          </div>
        )}

        {loading && (
          <div className="orders-loading">
            {[1, 2, 3].map((item) => (
              <div key={item} className="order-skeleton">
                <div className="skel skel-header" />
                <div className="skel skel-product" />
                <div className="skel skel-footer" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="orders-error">
            <Icon icon="lucide:wifi-off" />
            <h3>Could not load orders</h3>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} type="button">Try Again</button>
          </div>
        )}
        {!loading && !error && orders.length === 0 && (
          <div className="orders-empty">
            <EmptyStateIcon variant="orders" />
            <h3>No Orders Yet</h3>
            <p>Your orders will appear here once you place your first order.</p>
            <Link to="/collection" className="shop-now-btn"><Icon icon="lucide:sparkles" />Explore Collection</Link>
          </div>
        )}
        {!loading && !error && orders.length > 0 && (
          <div className="orders-list">
            {visibleOrders.length === 0 && searchQuery.trim() ? (
              <>
                <div className="orders-search-no-match">
                  <Icon icon="lucide:search-x" />
                  <p>No orders found for <strong>"{searchQuery.trim()}"</strong></p>
                  <button type="button" onClick={() => setSearchQuery("")}>Clear search</button>
                </div>
                {filteredOrders.length > 0 && (
                  <>
                    <p className="orders-search-showing-all">Showing all {selectedFilter !== "all" ? `${FILTER_OPTIONS.find(f => f.id === selectedFilter)?.label} ` : ""}orders:</p>
                    {filteredOrders.map((order) => (
                      <OrderCard key={order.id} order={order} onFeedback={handleFeedbackTrigger} />
                    ))}
                  </>
                )}
              </>
            ) : visibleOrders.length === 0 && selectedFilter !== "all" ? (
              <>
                <div className="orders-search-no-match">
                  <Icon icon="lucide:filter-x" />
                  <p>No <strong>{FILTER_OPTIONS.find(f => f.id === selectedFilter)?.label}</strong> orders found</p>
                  <button type="button" onClick={clearFilter}>Clear filter</button>
                </div>
                {orders.length > 0 && (
                  <>
                    <p className="orders-search-showing-all">Showing all orders:</p>
                    {orders.map((order) => (
                      <OrderCard key={order.id} order={order} onFeedback={handleFeedbackTrigger} />
                    ))}
                  </>
                )}
              </>
            ) : (
              visibleOrders.map((order) => (
                <OrderCard key={order.id} order={order} onFeedback={handleFeedbackTrigger} />
              ))
            )}
          </div>
        )}
      </main>

      {filterOpen && (
        <div className="orders-filter-overlay" role="dialog" aria-modal="true" onClick={() => setFilterOpen(false)}>
          <div className="orders-filter-sheet" onClick={(event) => event.stopPropagation()}>
            <span className="orders-filter-handle" />
            <div className="orders-filter-head">
              <h2>Filter orders</h2>
              <button type="button" onClick={() => setFilterOpen(false)} aria-label="Close filters">
                <Icon icon="lucide:x" />
              </button>
            </div>
            <div className="orders-filter-options">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={draftFilter === option.id ? "active" : ""}
                  onClick={() => setDraftFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="orders-filter-actions">
              <button type="button" onClick={clearFilter}>Clear</button>
              <button type="button" onClick={applyFilter}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {feedbackModal.isOpen && (
        <div className="cancel-modal-overlay">
          <div className="cancel-modal-container feedback-modal-container">
            <button type="button" className="cancel-modal-close" onClick={closeFeedbackModal} disabled={feedbackSubmitting}>
              <Icon icon="lucide:x" />
            </button>
            <div className="cancel-modal-header">
              <h3>Complete your Feedback</h3>
              <p>Rate <strong>{feedbackModal.productName}</strong> from your delivered order.</p>
            </div>

            <form className="cancel-modal-form" onSubmit={submitFeedback}>
              <div className="form-group">
                <label>Product Rating</label>
                <ReviewStars
                  rating={feedbackForm.rating}
                  onSelect={(rating) => setFeedbackForm((current) => ({ ...current, rating }))}
                />
              </div>

              <div className="form-group">
                <label htmlFor="feedback-title">Short title (optional)</label>
                <input
                  id="feedback-title"
                  type="text"
                  value={feedbackForm.title}
                  maxLength={120}
                  onChange={(event) => setFeedbackForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Beautiful saree, loved the fabric"
                />
              </div>

              <div className="form-group">
                <label htmlFor="feedback-comment">Product Review</label>
                <textarea
                  id="feedback-comment"
                  required
                  rows={4}
                  value={feedbackForm.comment}
                  onChange={(event) => setFeedbackForm((current) => ({ ...current, comment: event.target.value }))}
                  placeholder="Share what you liked about this product..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="feedback-images">Upload product photos (optional)</label>
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
                {feedbackForm.images.length > 0 && (
                  <div className="feedback-image-preview">
                    {feedbackForm.images.map((file) => (
                      <span key={`${file.name}-${file.size}`}>{file.name}</span>
                    ))}
                  </div>
                )}
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

      {actionModal.isOpen && (() => {
        const type = actionModal.type;
        const isReturn = type === "return";
        const isExchange = type === "exchange";
        const isCancelReturn = type === "cancel_return";
        const isCancelExchange = type === "cancel_exchange";

        const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

        const currentOrder = orders.find((o) => String(o.id) === String(actionModal.orderId));
        const bd = currentOrder ? getOrderBreakdown(currentOrder) : null;
        const isCod = bd && String(bd.paymentMethod).toUpperCase() === "COD";

        let refundInfo = null;
        if (bd && (type === "cancel_order" || type === "cancel_item")) {
          if (type === "cancel_order") {
            refundInfo = {
              rows: [
                ...(bd.payable > 0 ? [{ label: "Paid via payment", value: fmt(bd.payable) }] : []),
                ...(bd.walletAmount > 0 ? [{ label: "Wallet used", value: fmt(bd.walletAmount) }] : []),
              ],
              total: isCod ? 0 : bd.payable + bd.walletAmount,
              walletRefund: isCod ? 0 : bd.walletAmount,
              gatewayRefund: isCod ? 0 : bd.payable,
              isCod,
            };
          } else {
            const item = (currentOrder?.OrderItems || []).find((i) => String(i.id) === String(actionModal.itemId));
            const itemValue = Number(item?.price || 0) * Number(item?.quantity || 1);
            const discountRatio = bd.subtotal > 0 ? bd.couponDiscount / bd.subtotal : 0;
            const itemDiscount = Math.round(itemValue * discountRatio * 100) / 100;
            const estimatedRefund = Math.max(0, itemValue - itemDiscount);
            refundInfo = {
              rows: [
                { label: "Item value", value: fmt(itemValue) },
                ...(itemDiscount > 0 ? [{ label: "Coupon adjustment", value: `− ${fmt(itemDiscount)}` }] : []),
              ],
              total: isCod ? 0 : estimatedRefund,
              isCod,
              isEstimate: true,
            };
          }
        }

        let modalTitle = "Confirm Cancellation";
        let subTextPrefix = "Please specify reason for cancelling";
        let btnText = "Confirm Cancellation";
        let btnClass = "modal-action-btn danger";
        let dropdownOptions = CANCEL_REASONS;

        if (isReturn) {
          modalTitle = "Request Return";
          subTextPrefix = "Please specify reason for returning";
          btnText = "Submit Return Request";
          btnClass = "modal-action-btn primary";
          dropdownOptions = RETURN_REASONS;
        } else if (isExchange) {
          modalTitle = "Request Exchange";
          subTextPrefix = "Please specify reason for exchanging";
          btnText = "Submit Exchange Request";
          btnClass = "modal-action-btn primary";
          dropdownOptions = EXCHANGE_REASONS;
        } else if (isCancelReturn) {
          modalTitle = "Cancel Return Request";
          subTextPrefix = "Please specify reason for cancelling return";
          btnText = "Cancel Return Request";
          btnClass = "modal-action-btn danger";
          dropdownOptions = CANCEL_RETURN_REASONS;
        } else if (isCancelExchange) {
          modalTitle = "Cancel Exchange Request";
          subTextPrefix = "Please specify reason for cancelling exchange";
          btnText = "Cancel Exchange Request";
          btnClass = "modal-action-btn danger";
          dropdownOptions = CANCEL_EXCHANGE_REASONS;
        }

        return (
          <div className="cancel-modal-overlay">
            <div className="cancel-modal-container">
              <button 
                type="button"
                className="cancel-modal-close" 
                onClick={() => setActionModal({ isOpen: false, type: "cancel_order", orderId: null, itemId: null, itemName: "" })}
              >
                <Icon icon="lucide:x" />
              </button>
              <div className="cancel-modal-header">
                <h3>{modalTitle}</h3>
                <p>{subTextPrefix} <strong>{actionModal.itemName}</strong></p>
              </div>
              
              {refundInfo && (
                <div className="cancel-refund-box">
                  <p className="cancel-refund-title">Refund summary</p>
                  {refundInfo.isCod ? (
                    <p className="cancel-refund-note">This is a Cash on Delivery order — no online refund applicable.</p>
                  ) : (
                    <>
                      {refundInfo.rows.map((row, i) => (
                        <div key={i} className="cancel-refund-row">
                          <span>{row.label}</span>
                          <span>{row.value}</span>
                        </div>
                      ))}
                      <div className="cancel-refund-total">
                        <span>{refundInfo.isEstimate ? "Estimated refund" : "Total refund"}</span>
                        <strong>{fmt(refundInfo.total)}</strong>
                      </div>
                      <div className="cancel-refund-mode">
                        {refundInfo.walletRefund > 0 && refundInfo.gatewayRefund > 0
                          ? `${fmt(refundInfo.gatewayRefund)} to original payment · ${fmt(refundInfo.walletRefund)} to wallet`
                          : refundInfo.walletRefund > 0
                          ? "Credited back to your wallet"
                          : "Refunded to original payment method"}
                        {refundInfo.isEstimate && <span className="cancel-refund-approx"> · Exact amount may vary</span>}
                      </div>
                    </>
                  )}
                </div>
              )}

              <form onSubmit={handleModalSubmit} className="cancel-modal-form">
                <div className="form-group">
                  <label htmlFor="action-reason">Select Reason</label>
                  <select 
                    id="action-reason" 
                    value={actionForm.reason} 
                    onChange={(e) => setActionForm(prev => ({ ...prev, reason: e.target.value }))}
                    required
                  >
                    {dropdownOptions.map((r, i) => (
                      <option key={i} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="action-comments">Additional Comments (Optional)</label>
                  <textarea
                    id="action-comments"
                    placeholder="You can provide additional details here to help us process your request better."
                    value={actionForm.comments}
                    onChange={(e) => setActionForm(prev => ({ ...prev, comments: e.target.value }))}
                    rows={4}
                  />
                </div>

                <div className="modal-actions">
                  <button 
                    type="button" 
                    className="modal-action-btn secondary"
                    onClick={() => setActionModal({ isOpen: false, type: "cancel_order", orderId: null, itemId: null, itemName: "" })}
                    disabled={modalSubmitLoading}
                  >
                    Go Back
                  </button>
                  <button 
                    type="submit" 
                    className={btnClass}
                    disabled={modalSubmitLoading}
                  >
                    {modalSubmitLoading ? "Processing..." : btnText}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
