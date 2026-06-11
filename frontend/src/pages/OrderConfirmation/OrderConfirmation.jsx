import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";
import { imgUrl } from "../../utils/cloudinary";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../utils/api";
import { getOrderDisplayNumber } from "../../utils/itemCode";
import { numberEnv } from "../../utils/env";
import { useNotification } from "../../context/NotificationContext";
import "./OrderConfirmation.css";

const PLATFORM_FEE_AMOUNT = numberEnv("VITE_PLATFORM_FEE_AMOUNT");

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

const RatingStars = ({ rating = 0 }) => (
  <span className="confirmation-item-stars" aria-label={`${rating || 0} star rating`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Icon key={star} icon="mdi:star" className={Number(rating) >= star ? "filled" : "empty"} />
    ))}
  </span>
);

const getBreakdown = (order = {}) => {
  console.log("Calculating breakdown for order:", order);
  const items = order.OrderItems || [];
  const itemSubtotal = items.reduce((sum, item) => sum + toNumber(item.price) * Math.max(1, toNumber(item.quantity) || 1), 0);
  const subtotal = toNumber(order.subtotal_amount) || itemSubtotal;
  const shippingCharge = toNumber(order.shipping_charge);
  const shippingDiscount = toNumber(order.shipping_discount);
  const paymentFee = toNumber(order.payment_fee);
  const isCod = String(order.payment_method || "").toUpperCase() === "COD";
  const storedPlatformFee = toNumber(order.platform_fee);
  const storedCodFee = toNumber(order.cod_fee);
  const platformFee = storedPlatformFee || (paymentFee > 0 ? Math.min(PLATFORM_FEE_AMOUNT, paymentFee) : 0);
  const codFee = storedCodFee || (isCod ? Math.max(0, paymentFee - platformFee) : 0);
  const paymentDiscount = toNumber(order.payment_discount);
  const couponDiscount = toNumber(order.discount_amount);
  const walletAmount = toNumber(order.wallet_amount);
  const payable = toNumber(order.payable_amount) || toNumber(order.total_amount) || Math.max(
    0,
    subtotal + shippingCharge + paymentFee - shippingDiscount - paymentDiscount - couponDiscount - walletAmount,
  );

  return { subtotal, shippingCharge, shippingDiscount, paymentFee, platformFee, codFee, paymentDiscount, couponDiscount, walletAmount, payable };
};

const canCancelOrder = (order) => {
  if (order?.is_modified) return false;
  const rawDate = order?.createdAt || order?.created_at;
  const status = String(order?.status || "").toLowerCase();
  if (!rawDate || ["cancelled", "seller cancelled", "delivered", "shipped", "out for delivery", "rto delivered", "picked up", "picked_up", "awb assigned", "awb_assigned"].includes(status) || status.startsWith("rto ")) return false;
  const createdAt = new Date(rawDate).getTime();
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 24 * 60 * 60 * 1000;
};

const getCustomerOrderStatusLabel = (status) => {
  const normalized = String(status || "Pending").toLowerCase();
  if (normalized === "seller cancelled") return "Cancelled by seller";
  if (normalized.includes("partial") && normalized.includes("cancel")) return "Order updated";
  if (normalized === "cancel requested") return "Cancellation pending";
  if (normalized.includes("cancel")) return "Cancelled";
  if (normalized === "rto delivered") return "Order returned to seller";
  if (normalized === "rto initiated" || normalized === "rto in transit") return "Returning to seller";
  if (normalized.includes("return completed")) return "Return completed";
  if (normalized.includes("return picked up")) return "Return picked up";
  if (normalized.includes("out for return pickup")) return "Out for return pickup";
  if (normalized.includes("return initiated") || normalized.includes("return requested")) return "Return initiated";
  if (normalized.includes("exchange completed")) return "Exchange completed";
  if (normalized.includes("exchange picked up")) return "Exchange picked up";
  if (normalized.includes("exchange pickup scheduled")) return "Exchange pickup scheduled";
  if (normalized.includes("exchange initiated") || normalized.includes("exchange requested")) return "Exchange initiated";
  if (normalized === "undelivered") return "Delivery attempt failed";
  if (normalized === "delivered") return "Delivered";
  if (normalized === "out for delivery" || normalized === "out_for_delivery") return "Out for delivery";
  if (normalized === "shipped" || normalized.includes("in transit") || normalized.includes("manifest")) return "Shipped";
  if (normalized === "picked up" || normalized === "picked_up" || normalized.includes("pickup") || normalized === "awb assigned" || normalized === "awb_assigned") return "Picked up";
  if (normalized === "pending" || normalized === "processing" || normalized === "order placed" || normalized === "order_placed") return "Order placed";
  return status || "Pending";
};

const normalizeStatus = (value) => String(value || "Pending").toLowerCase();

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

const wasDelivered = (order) => {
  const status = normalizeStatus(order?.status);
  if (PRE_DELIVERY_STATUSES.has(status)) return false;
  return status === "delivered" || Boolean(order?.delivered_at);
};

const canReviewOrderItem = (order, item) => {
  const itemStatus = normalizeStatus(item?.status);
  return wasDelivered(order) && !itemStatus.includes("cancel");
};

const getActionableQty = (item) => Math.max(0, toNumber(item.actionable_quantity ?? (
  toNumber(item.quantity)
  - toNumber(item.cancelled_quantity)
  - toNumber(item.returned_quantity)
  - toNumber(item.exchanged_quantity)
  - toNumber(item.pending_action_quantity)
)));

const hasUsableAction = (item, actionType = null) => (item.actions || []).some((action) => {
  const type = String(action.action_type || action.actionType || "").toLowerCase();
  const status = String(action.status || "").toLowerCase();
  return (!actionType || type === actionType) && status !== "rejected";
});

const hasOrderExchangeHistory = (order) => Boolean(order?.exchange_requested_at)
  || (order?.OrderItems || []).some((item) => hasUsableAction(item, "exchange"));

const getEligibleActionItems = (order, actionType) => {
  const delivered = wasDelivered(order);
  const cancelAllowed = canCancelOrder(order);
  const exchangeUsed = hasOrderExchangeHistory(order);
  return (order?.OrderItems || []).filter((item) => {
    const itemStatus = normalizeStatus(item.status);
    if (getActionableQty(item) < 1) return false;
    if (itemStatus.includes("requested") || itemStatus.includes("initiated")) return false;
    if (hasUsableAction(item)) return false;
    if (actionType === "cancel") return cancelAllowed && itemStatus !== "cancelled";
    if (itemStatus === "cancelled") return false;
    if (actionType === "exchange" && exchangeUsed) return false;
    if (["return", "exchange"].includes(actionType)) return delivered;
    return false;
  });
};

const getItemDisplayStatus = (order, item) => {
  const status = normalizeStatus(item?.status);
  if (status && status !== "active") return getCustomerOrderStatusLabel(item.status);
  return getCustomerOrderStatusLabel(order?.status);
};

const getActionLabel = (action) => {
  const type = String(action?.action_type || "").toLowerCase();
  if (type === "return") return "Return";
  if (type === "exchange") return "Exchange";
  if (type === "cancel") return "Cancellation";
  return "Request";
};

const getOrderActions = (order) => ({
  canCancel: getEligibleActionItems(order, "cancel").length > 0,
  canReturnExchange: getEligibleActionItems(order, "return").length > 0 || getEligibleActionItems(order, "exchange").length > 0,
});

const stepState = (status, currentIndex, steps) => {
  const matchedIndex = steps.findIndex((step) => step.matches.some((match) => status.includes(match)));
  if (matchedIndex === -1) return currentIndex === 0 ? "current" : "pending";
  if (currentIndex < matchedIndex) return "done";
  if (currentIndex === matchedIndex) return "current";
  return "pending";
};

const buildSteps = (status, steps) => steps.map((step, index) => ({
  ...step,
  state: stepState(status, index, steps),
}));

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
      title: "Picked up",
      detail: "Courier pickup scheduled or completed",
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

const buildOrderTimeline = (order) => {
  const status = String(order?.status || "Pending").toLowerCase();

  const forwardSteps = [
    { title: "Order placed", detail: formatDate(order?.createdAt), icon: "lucide:check-circle-2", matches: ["pending", "order placed"] },
    { title: "Processing", detail: "Seller is preparing your order", icon: "lucide:package-2", matches: ["processing"] },
    { title: "Picked up", detail: "Courier has collected your order", icon: "lucide:package-check", matches: ["picked up", "picked_up", "pickup", "awb assigned", "awb_assigned"] },
    { title: "Shipped", detail: order?.shiprocket_awb ? `AWB ${order.shiprocket_awb}` : "Tracking appears after dispatch", icon: "lucide:truck", matches: ["shipped", "in transit"] },
    { title: "Out for delivery", detail: "Courier will attempt delivery at your address", icon: "lucide:navigation", matches: ["out for delivery"] },
    { title: "Delivered", detail: order?.delivered_at ? formatDate(order.delivered_at) : "Final delivery scan pending", icon: "lucide:badge-check", matches: ["delivered"] },
  ];

  const rtoSteps = [
    ...forwardSteps.slice(0, 5),
    { title: "Delivery attempt failed", detail: "Courier could not complete delivery", icon: "lucide:triangle-alert", matches: ["undelivered"] },
    { title: "RTO initiated", detail: "Shipment is returning to seller", icon: "lucide:undo-2", matches: ["rto initiated"] },
    { title: "RTO in transit", detail: "Shipment is on the way back", icon: "lucide:truck", matches: ["rto in transit"] },
    { title: "Order returned to seller", detail: order?.refund_note || "Order returned to seller", icon: "lucide:warehouse", matches: ["rto delivered", "seller cancelled"] },
  ];

  const cancelledSteps = [
    { title: "Order placed", detail: formatDate(order?.createdAt), icon: "lucide:check-circle-2", matches: ["order placed", "pending", "cancelled", "seller cancelled"] },
    { title: status === "seller cancelled" ? "Cancelled by seller" : "Cancelled", detail: "This order has been cancelled", icon: "lucide:x-circle", matches: ["cancelled", "seller cancelled"] },
  ];

  const returnSteps = [
    { title: "Return initiated", detail: "Return request created", icon: "lucide:rotate-ccw", matches: ["return requested", "return initiated"] },
    { title: "Out for return pickup", detail: "Courier will collect the parcel", icon: "lucide:navigation", matches: ["out for return pickup"] },
    { title: "Return picked up", detail: "Parcel collected by courier", icon: "lucide:package-check", matches: ["return picked up"] },
    { title: "Return completed", detail: order?.refund_note || "Return completed", icon: "lucide:badge-check", matches: ["return completed", "return delivered"] },
  ];

  const exchangeSteps = [
    { title: "Exchange initiated", detail: "Exchange request created", icon: "lucide:repeat-2", matches: ["exchange requested", "exchange initiated"] },
    { title: "Exchange pickup scheduled", detail: "Courier pickup is being arranged", icon: "lucide:calendar-clock", matches: ["exchange pickup scheduled", "out for exchange pickup"] },
    { title: "Exchange picked up", detail: "Exchange parcel collected", icon: "lucide:package-check", matches: ["exchange picked up"] },
    { title: "Exchange completed", detail: order?.refund_note || "Exchange completed", icon: "lucide:badge-check", matches: ["exchange completed", "exchange delivered"] },
  ];

  if (status.includes("exchange")) return buildSteps(status, exchangeSteps);
  if (status.includes("return")) return buildSteps(status, returnSteps);
  if (status === "cancelled" || status === "seller cancelled") return buildSteps(status, cancelledSteps);
  if (status.includes("rto") || status === "undelivered") return buildSteps(status, rtoSteps);
  if (status.includes("partial") && status.includes("cancel")) {
    return [
      { title: "Order placed", detail: formatDate(order?.createdAt), icon: "lucide:check-circle-2", state: "done" },
      { title: "Order updated", detail: `Some items cancelled${order?.modified_at ? ` · ${formatDate(order.modified_at)}` : ""}`, icon: "lucide:file-edit", state: "current" },
      { title: "Remaining items in transit", detail: "The rest of your order will be shipped as scheduled", icon: "lucide:truck", state: "pending" },
    ];
  }
  return buildSteps(status, forwardSteps);
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
  "Size or fit issue",
  "Product color/design is different from images",
  "Received damaged or defective product",
  "Quality of material is not as expected",
  "Wrong product delivered",
  "Other reason",
];

const EXCHANGE_REASONS = [
  "Need a different color/design",
  "Size or fit issue",
  "Received damaged or defective product",
  "Other reason",
];

const getActionConfig = (type) => {
  if (type === "return") return { title: "Request Return", label: "Return reason", reasons: RETURN_REASONS, button: "Submit Return Request", tone: "primary" };
  if (type === "exchange") return { title: "Request Exchange", label: "Exchange reason", reasons: EXCHANGE_REASONS, button: "Submit Exchange Request", tone: "primary" };
  return { title: "Cancel Products", label: "Cancellation reason", reasons: CANCEL_REASONS, button: "Submit Cancellation", tone: "danger" };
};

const OrderActivityPanel = ({ history }) => {
  if (!Array.isArray(history) || history.length <= 1) return null;
  return (
    <section className="order-panel">
      <div className="order-panel-head">
        <h2>Order activity</h2>
      </div>
      <ol className="order-activity-list">
        {[...history].reverse().map((entry, i) => (
          <li key={i} className="order-activity-entry">
            <span className="order-activity-time">{formatDate(entry.timestamp)}</span>
            <span className="order-activity-label">{getCustomerOrderStatusLabel(entry.status)}</span>
            {entry.note && <small className="order-activity-note">{entry.note}</small>}
          </li>
        ))}
      </ol>
    </section>
  );
};

const SkLine = ({ w, h = 12, mb = 0 }) => (
  <div className="oc-sk" style={{ width: w, height: h, borderRadius: 5, marginBottom: mb || undefined }} />
);

const OrderConfirmationSkeleton = () => (
  <main className="order-confirmation-page">
    <section className="order-success-hero">
      <div className="oc-sk oc-sk-hero-icon" />
      <div style={{ display: "grid", gap: 6 }}>
        <SkLine w={70} h={10} />
        <SkLine w={200} h={22} />
        <SkLine w={300} h={11} />
      </div>
    </section>

    <section className="order-confirmation-grid">
      <div className="order-confirmation-main">
        <div className="order-panel">
          <div className="order-panel-head">
            <SkLine w={140} h={14} />
            <SkLine w={80} h={11} />
          </div>
          <div className="confirmation-timeline">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="confirmation-step">
                <div className="oc-sk oc-sk-step-icon" />
                <div style={{ display: "grid", gap: 6 }}>
                  <SkLine w={130} h={13} />
                  <SkLine w={190} h={11} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="order-panel">
          <div className="order-panel-head">
            <SkLine w={50} h={14} />
            <SkLine w={55} h={11} />
          </div>
          <div className="confirmation-items">
            {[1, 2].map((i) => (
              <div key={i} className="oc-sk-item-row">
                <div className="oc-sk oc-sk-item-img" />
                <div style={{ display: "grid", gap: 7, flex: 1 }}>
                  <SkLine w="70%" h={13} />
                  <SkLine w="45%" h={11} />
                  <SkLine w={90} h={20} />
                </div>
                <SkLine w={65} h={13} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="order-confirmation-side">
        <div className="order-panel">
          <SkLine w={130} h={14} mb={14} />
          {[130, 110, 90, 120, 100, 80].map((w, i) => (
            <div key={i} className="oc-sk-summary-row">
              <SkLine w={w} h={12} />
              <SkLine w={55} h={12} />
            </div>
          ))}
        </div>

        <div className="order-panel">
          <SkLine w={130} h={14} mb={12} />
          <SkLine w="80%" h={12} mb={7} />
          <SkLine w="65%" h={12} mb={7} />
          <SkLine w="55%" h={12} />
        </div>

        <div className="oc-sk oc-sk-btn" />
      </aside>
    </section>
  </main>
);

export default function OrderConfirmation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const orderId = searchParams.get("orderId");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [cancelModal, setCancelModal] = useState({
    isOpen: false,
    type: "cancel",
    orderId: null,
    itemName: "",
    selected: {},
  });
  const [cancelForm, setCancelForm] = useState({
    reason: "Incorrect item/size selected",
    comments: ""
  });
  const [modalSubmitLoading, setModalSubmitLoading] = useState(false);
  const [actionEstimate, setActionEstimate] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, item: null });
  const [feedbackForm, setFeedbackForm] = useState({ rating: 5, title: "", comment: "", images: [] });
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [bankForm, setBankForm] = useState({
    account_holder_name: "",
    account_number: "",
    ifsc_code: "",
    bank_name: "",
    branch_name: "",
  });
  const [bankSaving, setBankSaving] = useState(false);

  const breakdown = useMemo(() => getBreakdown(order || {}), [order]);
  const timeline = useMemo(() => buildOrderTimeline(order), [order]);
  const orderActions = useMemo(() => getOrderActions(order), [order]);
  const canSelectExchangeItems = useMemo(() => getEligibleActionItems(order, "exchange").length > 0, [order]);
  const orderNumber = getOrderDisplayNumber(order);
  const needsCodBankDetails = String(order?.payment_method || "").toUpperCase() === "COD"
    && String(order?.refund_status || "").toLowerCase().includes("bank");

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

  const openActionModal = (type = "cancel") => {
    const config = getActionConfig(type);
    const eligibleItems = getEligibleActionItems(order, type);
    const selected = eligibleItems.reduce((map, item, index) => ({
      ...map,
      [item.id]: { checked: index === 0, quantity: getActionableQty(item) },
    }), {});
    setCancelModal({
      isOpen: true,
      type,
      orderId: order.id,
      itemName: `Order ${orderNumber}`,
      selected,
    });
    setCancelForm({
      reason: config.reasons[0],
      comments: ""
    });
    setActionEstimate(null);
    setLoadingEstimate(false);
  };

  const closeActionModal = (force = false) => {
    if (modalSubmitLoading && !force) return;
    setCancelModal({ isOpen: false, type: "cancel", orderId: null, itemName: "", selected: {} });
    setActionEstimate(null);
    setLoadingEstimate(false);
  };

  const openFeedbackModal = (item) => {
    if (!canReviewOrderItem(order, item)) {
      showNotification("Product review is available after delivery.", "warning");
      return;
    }
    setFeedbackModal({ isOpen: true, item });
    setFeedbackForm({
      rating: Number(item.feedback?.rating || 5),
      title: item.feedback?.title || "",
      comment: item.feedback?.comment || "",
      images: [],
    });
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
      const updated = await api.get(`/api/orders/${orderId}`);
      setOrder(updated.data);
    } catch (error) {
      showNotification(error?.response?.data?.message || "Could not submit review right now.", "error");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const selectedActionItems = useMemo(() => Object.entries(cancelModal.selected || {})
    .filter(([, value]) => value.checked)
    .map(([id, value]) => ({ orderItemId: Number(id), quantity: value.quantity || null })), [cancelModal.selected]);

  useEffect(() => {
    let cancelled = false;
    setActionEstimate(null);
    const loadEstimate = async () => {
      if (!cancelModal.isOpen || !cancelModal.orderId || !selectedActionItems.length) {
        setLoadingEstimate(false);
        return;
      }
      setLoadingEstimate(true);
      try {
        const response = await api.post(`/api/orders/${cancelModal.orderId}/item-actions/estimate`, {
          actionType: cancelModal.type,
          items: selectedActionItems,
        });
        if (!cancelled) setActionEstimate(response.data);
      } catch {
        if (!cancelled) setActionEstimate(null);
      } finally {
        if (!cancelled) setLoadingEstimate(false);
      }
    };
    loadEstimate();
    return () => {
      cancelled = true;
    };
  }, [cancelModal.isOpen, cancelModal.orderId, cancelModal.type, selectedActionItems]);

  const submitBankDetails = async (event) => {
    event.preventDefault();
    setBankSaving(true);
    try {
      const response = await api.post(`/api/orders/${orderId}/refund-bank-details`, bankForm);
      showNotification(response.data?.message || "Bank details saved.", "success");
      const updated = await api.get(`/api/orders/${orderId}`);
      setOrder(updated.data);
      setBankForm({
        account_holder_name: "",
        account_number: "",
        ifsc_code: "",
        bank_name: "",
        branch_name: "",
      });
    } catch (err) {
      showNotification(err?.response?.data?.message || "Please check bank details and try again.", "error");
    } finally {
      setBankSaving(false);
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setModalSubmitLoading(true);
    const { orderId, type } = cancelModal;
    const finalReason = cancelForm.comments.trim() 
      ? `${cancelForm.reason} - ${cancelForm.comments.trim()}`
      : cancelForm.reason;

    try {
      if (!selectedActionItems.length) {
        showNotification("Please select at least one product.", "warning");
        setModalSubmitLoading(false);
        return;
      }
      const endpoint = type === "cancel" ? `/api/orders/${orderId}/item-actions/cancel` : `/api/orders/${orderId}/item-actions`;
      const response = await api.post(endpoint, {
        actionType: type,
        items: selectedActionItems,
        reason: finalReason,
        comments: cancelForm.comments.trim(),
      });
      showNotification(response.data?.message || "Request submitted.", "success");
      const updated = await api.get(`/api/orders/${orderId}`);
      setOrder(updated.data || response.data.order || order);
      closeActionModal(true);
    } catch (err) {
      showNotification(err?.response?.data?.message || "Unable to process this request.", "error");
    } finally {
      setModalSubmitLoading(false);
    }
  };

  if (loading) return <OrderConfirmationSkeleton />;

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
          <span>Placed on {formatDate(order.createdAt)}</span>
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
                <div key={`${step.title}-${index}`} className={`confirmation-step is-${step.state || "pending"}`}>
                  <div className="confirmation-step-track">
                    <span className="confirmation-step-icon">
                      {step.state === "done" ? <Icon icon="lucide:check" /> : <Icon icon={step.icon} />}
                    </span>
                    {index < timeline.length - 1 && <div className="confirmation-step-line" />}
                  </div>
                  <div className="confirmation-step-body">
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

          <OrderActivityPanel history={order.status_history} />

          <section className="order-panel">
            <div className="order-panel-head">
              <h2>Items</h2>
              <span>{(order.OrderItems || []).length} item(s)</span>
            </div>
            <div className="confirmation-items">
              {(order.OrderItems || []).map((item, index) => {
                const productUrl = item.product_slug ? `/product/${item.product_slug}` : null;
                const itemRating = Number(item.feedback?.rating || 0);
                return (
                <article className="confirmation-item" key={`${item.product_id}-${item.colorId || index}`}>
                  <div className="confirmation-item-top">
                    {productUrl ? (
                      <Link to={productUrl} className="confirmation-item-media" aria-label={`Open ${item.product_name}`}>
                        {getItemImage(item) ? <img src={imgUrl(getItemImage(item))} alt={item.product_name} /> : <Icon icon="lucide:image-off" />}
                      </Link>
                    ) : (
                      <div className="confirmation-item-media">
                        {getItemImage(item) ? <img src={imgUrl(getItemImage(item))} alt={item.product_name} /> : <Icon icon="lucide:image-off" />}
                      </div>
                    )}
                    <div className="confirmation-item-copy">
                      {productUrl ? <Link to={productUrl} className="confirmation-product-link"><h3>{item.product_name}</h3></Link> : <h3>{item.product_name}</h3>}
                      <p>{getItemColor(item)}</p>
                      {(() => {
                        const cancelledQty = toNumber(item.cancelled_quantity);
                        const activeQty = Math.max(0, toNumber(item.quantity) - cancelledQty);
                        return (
                          <p>
                            Qty {activeQty}
                            {cancelledQty > 0 ? ` · ${cancelledQty} cancelled` : ""}
                            {item.sku ? ` - SKU: ${item.sku}` : ""}
                          </p>
                        );
                      })()}
                      <span className="confirmation-item-status">{getItemDisplayStatus(order, item)}</span>
                    </div>
                  </div>
                  {canReviewOrderItem(order, item) && (
                    <div className="confirmation-feedback-area">
                      <RatingStars rating={itemRating} />
                      <button className="confirmation-feedback-btn" type="button" onClick={() => openFeedbackModal(item)}>
                        {item.feedback ? "Edit Feedback" : "Add Feedback"}
                      </button>
                    </div>
                  )}
                  {(item.actions || []).some((action) => String(action.action_type || "").toLowerCase() !== "cancel") && (
                    <div className="confirmation-item-actions">
                      {(item.actions || [])
                        .filter((action) => String(action.action_type || "").toLowerCase() !== "cancel")
                        .map((action) => (
                        <div key={action.id || `${action.action_type}-${action.created_at}`}>
                          <span>{getActionLabel(action)}</span>
                          <strong>{action.status || "Initiated"}</strong>
                          <small>
                            Qty {action.quantity || 1}
                            {action.completed_at
                              ? ` · Completed ${formatDate(action.completed_at)}`
                              : action.created_at ? ` · ${formatDate(action.created_at)}` : ""}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                  <strong>{formatPrice(toNumber(item.price) * Math.max(0, toNumber(item.quantity) - toNumber(item.cancelled_quantity)))}</strong>
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
            <div className="summary-row">
              <span>Delivery charge</span>
              <strong>
                {breakdown.shippingDiscount >= breakdown.shippingCharge && breakdown.shippingCharge > 0 ? (
                  <><span className="summary-strike">{formatPrice(breakdown.shippingCharge)}</span> Free</>
                ) : formatPrice(Math.max(0, breakdown.shippingCharge - breakdown.shippingDiscount))}
              </strong>
            </div>
            {breakdown.paymentDiscount > 0 && <div className="summary-row is-saving"><span>Payment discount</span><strong>-{formatPrice(breakdown.paymentDiscount)}</strong></div>}
            {breakdown.codFee > 0 && <div className="summary-row"><span>COD charge</span><strong>{formatPrice(breakdown.codFee)}</strong></div>}
            {breakdown.platformFee > 0 && <div className="summary-row"><span>Platform fee</span><strong>{formatPrice(breakdown.platformFee)}</strong></div>}
            {breakdown.couponDiscount > 0 && <div className="summary-row is-saving"><span>Coupon{order.coupon_code ? ` (${order.coupon_code})` : ""}</span><strong>-{formatPrice(breakdown.couponDiscount)}</strong></div>}
            {breakdown.walletAmount > 0 && <div className="summary-row is-saving"><span>Wallet used</span><strong>-{formatPrice(breakdown.walletAmount)}</strong></div>}
            <div className="summary-row is-final"><span>Final amount</span><strong>{formatPrice(breakdown.payable)}</strong></div>
            <div className="payment-tags">
              <span>{order.payment_method || "Prepaid"}</span>
              <span>{order.payment_status || "Paid"}</span>
            </div>
            {(() => {
              const refundStatus = String(order.refund_status || "").toLowerCase();
              const refundAmt = toNumber(order.refund_amount);
              const isPartial = String(order.status || "").toLowerCase().includes("partial");
              if (!refundStatus.includes("pending") && !refundStatus.includes("refund")) return null;
              return (
                <div className="refund-notice">
                  <Icon icon="lucide:refresh-ccw" />
                  <div>
                    <strong>{isPartial ? "Partial refund pending" : "Refund pending"}</strong>
                    <p>
                      {order.refund_note || (
                        refundAmt > 0
                          ? `${formatPrice(refundAmt)} will be refunded to your original payment method.`
                          : "Refund will be processed shortly."
                      )}
                    </p>
                  </div>
                </div>
              );
            })()}
          </section>

          <section className="order-panel">
            <h2>Delivery address</h2>
            <p className="address-copy">{order.customer_name}<br />{order.address}<br />{order.city}, {order.state} - {order.pincode}<br />Phone: {order.phone}</p>
          </section>

          {needsCodBankDetails && (
            <section className="order-panel">
              <h2>Refund bank details</h2>
              {order.refund_bank_details ? (
                <div className="refund-bank-saved">
                  <strong>{order.refund_bank_details.account_holder_name}</strong>
                  <span>{order.refund_bank_details.bank_name} - {order.refund_bank_details.ifsc_code}</span>
                  <span>Account ending {order.refund_bank_details.account_number_last4}</span>
                </div>
              ) : (
                <form className="refund-bank-form" onSubmit={submitBankDetails}>
                  <input
                    required
                    value={bankForm.account_holder_name}
                    onChange={(event) => setBankForm((current) => ({ ...current, account_holder_name: event.target.value }))}
                    placeholder="Account holder name"
                  />
                  <input
                    required
                    inputMode="numeric"
                    value={bankForm.account_number}
                    onChange={(event) => setBankForm((current) => ({ ...current, account_number: event.target.value }))}
                    placeholder="Account number"
                  />
                  <input
                    required
                    value={bankForm.ifsc_code}
                    onChange={(event) => setBankForm((current) => ({ ...current, ifsc_code: event.target.value.toUpperCase() }))}
                    placeholder="IFSC code"
                  />
                  <input
                    required
                    value={bankForm.bank_name}
                    onChange={(event) => setBankForm((current) => ({ ...current, bank_name: event.target.value }))}
                    placeholder="Bank name"
                  />
                  <input
                    value={bankForm.branch_name}
                    onChange={(event) => setBankForm((current) => ({ ...current, branch_name: event.target.value }))}
                    placeholder="Branch name (optional)"
                  />
                  <button type="submit" disabled={bankSaving}>{bankSaving ? "Saving..." : "Save bank details"}</button>
                </form>
              )}
            </section>
          )}

          {order.is_modified && !["cancelled", "seller cancelled"].includes(String(order.status || "").toLowerCase()) && (
            <div className="order-modified-notice">
              <Icon icon="lucide:lock" />
              <p>This order has been updated. No further changes are possible.</p>
            </div>
          )}
          {Object.values(orderActions).some(Boolean) && (
            <div className="order-action-list order-action-list-standalone">
              {orderActions.canCancel && (
                <>
                  <button className="cancel-order-btn" type="button" onClick={() => openActionModal("cancel")}>
                    Cancel products
                  </button>
                  {(() => {
                    const rawDate = order.createdAt || order.created_at;
                    if (!rawDate) return null;
                    const remaining = 24 * 60 * 60 * 1000 - (Date.now() - new Date(rawDate).getTime());
                    if (remaining <= 0) return null;
                    const hrs = Math.floor(remaining / (1000 * 60 * 60));
                    const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                    return <p className="cancel-window-info"><Icon icon="lucide:clock" /> {label} left to cancel</p>;
                  })()}
                </>
              )}
              {orderActions.canReturnExchange && (
                <button className="order-secondary-btn" type="button" onClick={() => openActionModal("return")}>
                  Return / exchange products
                </button>
              )}
            </div>
          )}

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
              onClick={closeActionModal}
            >
              <Icon icon="lucide:x" />
            </button>
            <div className="cancel-modal-header">
              <h3>{getActionConfig(cancelModal.type).title}</h3>
              <p>{cancelModal.type === "cancel" ? <>Select products and adjust quantities to cancel for <strong>{cancelModal.itemName}</strong>.</> : <>Select product for <strong>{cancelModal.itemName}</strong>.</>}</p>
            </div>
            
            <form onSubmit={handleModalSubmit} className="cancel-modal-form">
              {cancelModal.type !== "cancel" && (
                <div className="action-type-switch">
                  <button
                    type="button"
                    className={cancelModal.type === "return" ? "active" : ""}
                    onClick={() => {
                      const eligible = getEligibleActionItems(order, "return");
                      setCancelModal((current) => ({
                        ...current,
                        type: "return",
                        selected: eligible.reduce((map, item, index) => ({ ...map, [item.id]: { checked: index === 0, quantity: getActionableQty(item) } }), {}),
                      }));
                      setCancelForm({ reason: RETURN_REASONS[0], comments: "" });
                    }}
                  >
                    Return
                  </button>
                  {canSelectExchangeItems && (
                    <button
                      type="button"
                      className={cancelModal.type === "exchange" ? "active" : ""}
                      onClick={() => {
                        const eligible = getEligibleActionItems(order, "exchange");
                        setCancelModal((current) => ({
                          ...current,
                          type: "exchange",
                          selected: eligible.reduce((map, item, index) => ({ ...map, [item.id]: { checked: index === 0, quantity: getActionableQty(item) } }), {}),
                        }));
                        setCancelForm({ reason: EXCHANGE_REASONS[0], comments: "" });
                      }}
                    >
                      Exchange
                    </button>
                  )}
                </div>
              )}

              <div className="action-item-picker">
                {cancelModal.type === "cancel" && (() => {
                  const eligibleItems = getEligibleActionItems(order, "cancel");
                  if (eligibleItems.length <= 1) return null;
                  const totalQty = eligibleItems.reduce((sum, it) => sum + getActionableQty(it), 0);
                  const allSelected = eligibleItems.every((it) => cancelModal.selected?.[it.id]?.checked);
                  return (
                    <div className="action-select-all-row">
                      <button
                        type="button"
                        className="action-select-all-btn"
                        onClick={() => {
                          const next = !allSelected;
                          setCancelModal((current) => ({
                            ...current,
                            selected: eligibleItems.reduce((map, it) => ({
                              ...map,
                              [it.id]: { checked: next, quantity: getActionableQty(it) },
                            }), {}),
                          }));
                        }}
                      >
                        {allSelected ? "Deselect all" : `Select all · ${totalQty} unit${totalQty !== 1 ? "s" : ""}`}
                      </button>
                    </div>
                  );
                })()}
                {getEligibleActionItems(order, cancelModal.type).map((item) => {
                  const sel = cancelModal.selected?.[item.id] || { checked: false, quantity: getActionableQty(item) };
                  const maxQty = getActionableQty(item);
                  return (
                    <div className={`action-item-row${sel.checked ? " is-selected" : ""}`} key={item.id}>
                      <label className="action-item-check-wrap">
                        <input
                          type="checkbox"
                          checked={Boolean(sel.checked)}
                          onChange={(event) => setCancelModal((current) => ({
                            ...current,
                            selected: {
                              ...current.selected,
                              [item.id]: { ...sel, checked: event.target.checked },
                            },
                          }))}
                        />
                        <span className="action-item-info">
                          <strong>{item.product_name}</strong>
                          <small>{getItemColor(item)}{cancelModal.type !== "cancel" && ` · Qty ${maxQty}`}</small>
                        </span>
                      </label>
                      {cancelModal.type === "cancel" && sel.checked && maxQty > 1 && (
                        <div className="action-qty-stepper">
                          <button
                            type="button"
                            disabled={sel.quantity <= 1}
                            onClick={() => setCancelModal((current) => ({
                              ...current,
                              selected: { ...current.selected, [item.id]: { ...sel, quantity: Math.max(1, sel.quantity - 1) } },
                            }))}
                          >−</button>
                          <span>{sel.quantity} / {maxQty}</span>
                          <button
                            type="button"
                            disabled={sel.quantity >= maxQty}
                            onClick={() => setCancelModal((current) => ({
                              ...current,
                              selected: { ...current.selected, [item.id]: { ...sel, quantity: Math.min(maxQty, sel.quantity + 1) } },
                            }))}
                          >+</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="form-group">
                <label htmlFor="cancel-reason">{getActionConfig(cancelModal.type).label}</label>
                <select 
                  id="cancel-reason" 
                  value={cancelForm.reason} 
                  onChange={(e) => setCancelForm(prev => ({ ...prev, reason: e.target.value }))}
                  required
                >
                  {getActionConfig(cancelModal.type).reasons.map((r, i) => (
                    <option key={i} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="cancel-comments">Additional Comments (Optional)</label>
                <textarea
                  id="cancel-comments"
                  placeholder="You can provide additional details here to help us process your request better."
                  value={cancelForm.comments}
                  onChange={(e) => setCancelForm(prev => ({ ...prev, comments: e.target.value }))}
                  rows={4}
                />
              </div>

              {loadingEstimate && (
                <div className="action-estimate-loading">
                  <div className="action-estimate-spinner"></div>
                  <span>Fetching details...</span>
                </div>
              )}

              {!loadingEstimate && actionEstimate?.totals && (
                <div className="action-estimate-box">
                  <div><span>Selected product value</span><strong>{formatPrice(actionEstimate.totals.item_amount)}</strong></div>
                  {cancelModal.type === "return" && (
                    <>
                      <div><span>Delivery charge deduction</span><strong>{formatPrice(actionEstimate.totals.forward_shipping_deduction)}</strong></div>
                      <div><span>Return pickup charge</span><strong>{formatPrice(actionEstimate.totals.reverse_shipping_deduction)}</strong></div>
                      <p className="action-estimate-note">
                        <Icon icon="lucide:info" />
                        RTO charge is not included in normal returns. RTO charge applies only when a shipment is returned to seller after failed delivery.
                      </p>
                    </>
                  )}
                  <div><span>{cancelModal.type === "exchange" ? "Refund" : "Estimated refund"}</span><strong>{formatPrice(actionEstimate.totals.estimated_refund_amount)}</strong></div>
                </div>
              )}

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="modal-action-btn secondary"
                  onClick={closeActionModal}
                  disabled={modalSubmitLoading}
                >
                  Go Back
                </button>
                <button 
                  type="submit" 
                  className={`modal-action-btn ${getActionConfig(cancelModal.type).tone}`}
                  disabled={modalSubmitLoading}
                >
                  {modalSubmitLoading ? "Processing..." : getActionConfig(cancelModal.type).button}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
