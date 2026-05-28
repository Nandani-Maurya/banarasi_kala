import { Icon } from "@iconify/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Pending: { color: "#8a5a00", bg: "#fff6dc", icon: "lucide:clock-3", label: "Order placed" },
  Processing: { color: "#2454a6", bg: "#eff5ff", icon: "lucide:package", label: "Processing" },
  Shipped: { color: "#6840aa", bg: "#f5f0ff", icon: "lucide:truck", label: "Shipped" },
  Delivered: { color: "#087a55", bg: "#edfdf5", icon: "lucide:check-circle", label: "Delivered" },
  Cancelled: { color: "#b42318", bg: "#fff0ee", icon: "lucide:x-circle", label: "Cancelled" },
  "Out For Delivery": { color: "#9a6200", bg: "#fff6dc", icon: "lucide:navigation", label: "Out for delivery" },
};

const getStatus = (status) => {
  if (!status) return STATUS_CONFIG.Pending;
  const normalized = String(status).toLowerCase();
  if (normalized === "pending") return STATUS_CONFIG.Pending;
  if (normalized === "processing") return STATUS_CONFIG.Processing;
  if (normalized === "shipped") return STATUS_CONFIG.Shipped;
  if (normalized === "delivered") return STATUS_CONFIG.Delivered;
  if (normalized === "cancelled") return STATUS_CONFIG.Cancelled;
  if (normalized === "out for delivery" || normalized === "out_for_delivery") return STATUS_CONFIG["Out For Delivery"];
  
  return STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
};

const toNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};
const formatPrice = (value) => `Rs. ${toNumber(value).toLocaleString("en-IN")}`;
const getItemImage = (item) => item.image_url || item.product_image_url || "";
const getItemColorLabel = (item) => item.color_name || item.Color?.name || "Selected color";
const isCancelled = (order) => String(order.status || "").toLowerCase() === "cancelled";
const isDelivered = (order) => String(order.status || "").toLowerCase() === "delivered";

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
  if (!order?.createdAt) return false;
  const status = String(order.status || "").toLowerCase();
  if (["cancelled", "delivered"].includes(status)) return false;
  const createdAt = new Date(order.createdAt).getTime();
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

const OrderCard = ({ order, onOrderUpdated, showNotification, onActionTrigger }) => {
  const [expanded, setExpanded] = useState(false);
  const [tracking, setTracking] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const statusConfig = getStatus(order.status);
  const orderNumber = getOrderDisplayNumber(order);
  const items = order.OrderItems || [];
  const activeItems = useMemo(() => items.filter(item => String(item.status || "").toLowerCase() !== "cancelled"), [items]);
  const breakdown = useMemo(() => getOrderBreakdown(order), [order]);
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const cancellationAvailable = canCancelOrder(order);

  const loadTracking = useCallback(async () => {
    if (tracking || trackLoading) return;
    setTrackLoading(true);
    setTrackError(null);

    try {
      const response = await api.get(`/api/orders/track/${order.id}`);
      setTracking(response.data);
    } catch (error) {
      setTrackError(error?.response?.data?.message || error.message || "Could not load tracking info. Please try again.");
    } finally {
      setTrackLoading(false);
    }
  }, [order.id, tracking, trackLoading]);

  const handleExpand = () => {
    const nextState = !expanded;
    setExpanded(nextState);
    if (nextState) loadTracking();
  };

  const handleCancelClick = () => {
    if (onActionTrigger) {
      onActionTrigger({
        type: "cancel_order",
        orderId: order.id,
        itemId: null,
        itemName: `Order ${orderNumber}`
      });
    }
  };

  const handleCancelItemClick = (itemId, itemName) => {
    if (onActionTrigger) {
      onActionTrigger({
        type: "cancel_item",
        orderId: order.id,
        itemId,
        itemName
      });
    }
  };

  const handleReturnRequest = () => {
    if (onActionTrigger) {
      onActionTrigger({
        type: "return",
        orderId: order.id,
        itemId: null,
        itemName: `Order ${orderNumber}`
      });
    }
  };

  const handleExchangeRequest = () => {
    if (onActionTrigger) {
      onActionTrigger({
        type: "exchange",
        orderId: order.id,
        itemId: null,
        itemName: `Order ${orderNumber}`
      });
    }
  };

  const handleCancelReturn = () => {
    if (onActionTrigger) {
      onActionTrigger({
        type: "cancel_return",
        orderId: order.id,
        itemId: null,
        itemName: `Return for Order ${orderNumber}`
      });
    }
  };

  const handleCancelExchange = () => {
    if (onActionTrigger) {
      onActionTrigger({
        type: "cancel_exchange",
        orderId: order.id,
        itemId: null,
        itemName: `Exchange for Order ${orderNumber}`
      });
    }
  };

  const activities = tracking?.tracking?.tracking_data?.shipment_track_activities || [];
  const etd = tracking?.tracking?.tracking_data?.etd;
  const expectedDeliveryDate = etd ? formatEstimatedDeliveryDate(getEstimatedDeliveryDate(etd)) : "";
  const courierName = tracking?.tracking?.tracking_data?.shipment_track?.[0]?.courier_name;
  const awbCode = tracking?.tracking?.tracking_data?.shipment_track?.[0]?.awb_code;
  const hasUsedAfterSale = !!order.return_requested_at || !!order.exchange_requested_at || String(order.status || "").toLowerCase().includes("return") || String(order.status || "").toLowerCase().includes("exchange");
  const isReturnFlow = !!order.return_requested_at || String(order.status || "").toLowerCase().includes("return");
  const isExchangeFlow = !!order.exchange_requested_at || String(order.status || "").toLowerCase().includes("exchange");
  const canRequestReturn = String(order.status).toLowerCase() === "delivered" && !hasUsedAfterSale;
  const canRequestExchange = String(order.status).toLowerCase() === "delivered" && !hasUsedAfterSale;

  return (
    <article className={`order-card ${isCancelled(order) ? "is-cancelled" : ""}`}>
      <div className="order-card-header">
        <div className="order-meta">
          <span className="order-number">Order {orderNumber}</span>
          <span className="order-date">{orderDate}</span>
        </div>
        <div className="order-status-badge" style={{ color: statusConfig.color, backgroundColor: statusConfig.bg }}>
          <Icon icon={statusConfig.icon} />
          {statusConfig.label}
        </div>
      </div>

      <div className="order-products">
        <div className="order-products-title">
          <span>Items</span>
          <small>{activeItems.length} {activeItems.length === 1 ? "item" : "items"}</small>
        </div>

        {items.map((item, index) => {
          const imageUrl = getItemImage(item);
          const colorHex = item.color_hex || item.Color?.hex_code || "#b7822d";
          const lineTotal = toNumber(item.price) * Math.max(1, toNumber(item.quantity) || 1);
          const productName = item.product_name || `Product #${item.product_id}`;
          const productUrl = item.product_slug ? `/product/${item.product_slug}` : null;
          const isItemCancelled = String(item.status || "").toLowerCase() === "cancelled";

          return (
            <div 
              key={`${item.product_id}-${item.colorId || index}`} 
              className={`order-product-item ${isItemCancelled ? "item-cancelled" : ""}`}
            >
              {productUrl ? (
              <Link to={productUrl} className="order-product-media" aria-label={`Open ${productName}`}>
                {imageUrl ? (
                  <img src={imageUrl} alt={productName} loading="lazy" />
                ) : (
                  <div className="order-product-placeholder">
                    <Icon icon="lucide:image-off" />
                  </div>
                )}
              </Link>
              ) : (
              <div className="order-product-media">
                {imageUrl ? (
                  <img src={imageUrl} alt={productName} loading="lazy" />
                ) : (
                  <div className="order-product-placeholder">
                    <Icon icon="lucide:image-off" />
                  </div>
                )}
              </div>
              )}

              <div className="order-product-details">
                {productUrl ? (
                  <Link to={productUrl} className="order-product-title-link"><h3>{productName}</h3></Link>
                ) : (
                  <h3>{productName}</h3>
                )}
                <div className="order-product-subline">
                  <span>Qty {item.quantity}</span>
                  <span className="order-dot" />
                  <span>{formatPrice(item.price)} each</span>
                  {item.sku && (
                    <>
                      <span className="order-dot" />
                      <span>SKU: {item.sku}</span>
                    </>
                  )}
                </div>
                <div className="order-product-color">
                  <span className="order-color-swatch" style={{ backgroundColor: colorHex }} />
                  <span>{getItemColorLabel(item)}</span>
                </div>
                {isItemCancelled ? (
                  <span className="item-cancelled-badge">
                    <Icon icon="lucide:x-circle" />
                    Cancelled
                  </span>
                ) : (
                  cancellationAvailable && activeItems.length > 1 && (
                    <button 
                      className="cancel-item-btn" 
                      type="button" 
                      onClick={() => handleCancelItemClick(item.id, productName)}
                    >
                      <Icon icon="lucide:x-circle" />
                      <span>Cancel Item</span>
                    </button>
                  )
                )}
                {item.shipping_meta?.refund_rules && (
                  <p className="order-product-refund">
                    Return: {formatPrice(item.shipping_meta.refund_rules.return_delivery_deduction)} delivery + {formatPrice(item.shipping_meta.refund_rules.return_rto_deduction)} RTO deduction. Exchange: no deduction.
                  </p>
                )}
              </div>

              <span className={`order-line-total ${isItemCancelled ? "line-through-price" : ""}`}>{formatPrice(lineTotal)}</span>
            </div>
          );
        })}
      </div>

      <div className="order-breakdown" aria-label={`Order ${order.id} payment summary`}>
        <div className="breakdown-row">
          <span>Product total</span>
          <strong>{formatPrice(breakdown.subtotal)}</strong>
        </div>
        <div className="breakdown-row">
          <span>Delivery charge</span>
          <strong>{formatPrice(breakdown.shippingCharge)}</strong>
        </div>
        {breakdown.shippingDiscount > 0 && (
          <div className="breakdown-row is-saving">
            <span>Free shipping benefit</span>
            <strong>-{formatPrice(breakdown.shippingDiscount)}</strong>
          </div>
        )}
        {breakdown.paymentDiscount > 0 && (
          <div className="breakdown-row is-saving">
            <span>Prepaid payment discount</span>
            <strong>-{formatPrice(breakdown.paymentDiscount)}</strong>
          </div>
        )}
        {breakdown.codCharge > 0 && (
          <div className="breakdown-row">
            <span>COD charge</span>
            <strong>{formatPrice(breakdown.codCharge)}</strong>
          </div>
        )}
        {breakdown.platformFee > 0 && (
          <div className="breakdown-row">
            <span>Platform fee</span>
            <strong>{formatPrice(breakdown.platformFee)}</strong>
          </div>
        )}
        {breakdown.couponDiscount > 0 && (
          <div className="breakdown-row is-saving">
            <span>Coupon discount{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
            <strong>-{formatPrice(breakdown.couponDiscount)}</strong>
          </div>
        )}
        {breakdown.walletAmount > 0 && (
          <div className="breakdown-row is-saving">
            <span>Wallet used</span>
            <strong>-{formatPrice(breakdown.walletAmount)}</strong>
          </div>
        )}
        <div className="breakdown-row final">
          <span>Final amount</span>
          <strong>{formatPrice(breakdown.payable)}</strong>
        </div>
      </div>

      <div className="order-payment-row">
        <span><Icon icon="lucide:credit-card" /> {breakdown.paymentMethod}</span>
        <span>{breakdown.paymentStatus}</span>
      </div>

      <div className="order-address">
        <Icon icon="lucide:map-pin" />
        <span>{order.address}, {order.city} - {order.pincode}</span>
      </div>

      {(order.refund_note || isCancelled(order)) && (
        <div className="order-refund-note">
          <Icon icon="lucide:info" />
          <span>{order.refund_note || "Refund will be processed in 1-2 days for paid orders."}</span>
        </div>
      )}

      <div className="order-actions">
        {!isCancelled(order) && (!isDelivered(order) || hasUsedAfterSale) && (
          <button className={`order-action-btn primary ${expanded ? "active" : ""}`} onClick={handleExpand} type="button">
            <Icon icon={expanded ? "lucide:chevron-up" : "lucide:map-pin"} />
            {hasUsedAfterSale 
              ? (expanded ? "Hide pickup tracking" : "Track your pickup")
              : (expanded ? "Hide tracking" : "Track order")
            }
          </button>
        )}
        {canRequestReturn && (
          <button className="order-action-btn" onClick={handleReturnRequest} type="button">
            <Icon icon="lucide:rotate-ccw" />
            Request return
          </button>
        )}
        {canRequestExchange && (
          <button className="order-action-btn" onClick={handleExchangeRequest} type="button">
            <Icon icon="lucide:repeat-2" />
            Request exchange
          </button>
        )}
        {isReturnFlow && (
          <button className="order-action-btn danger" onClick={handleCancelReturn} type="button" disabled={actionLoading}>
            <Icon icon="lucide:x" />
            {actionLoading ? "Processing..." : "Cancel return"}
          </button>
        )}
        {isExchangeFlow && (
          <button className="order-action-btn danger" onClick={handleCancelExchange} type="button" disabled={actionLoading}>
            <Icon icon="lucide:x" />
            {actionLoading ? "Processing..." : "Cancel exchange"}
          </button>
        )}
        {!isReturnFlow && !isExchangeFlow && (
          cancellationAvailable ? (
            activeItems.length === 1 && (
              <button className="order-action-btn danger" onClick={handleCancelClick} type="button">
                <Icon icon="lucide:x" />
                Cancel order
              </button>
            )
          ) : (
            !isCancelled(order) && <span className="cancel-window-note">Cancellation available within 24 hours only.</span>
          )
        )}
      </div>

      {expanded && (
        <div className="tracking-panel">
          <div className="tracking-panel-header">
            <h4><Icon icon="lucide:truck" /> Shipment tracking</h4>
            {courierName && <span className="courier-badge">{courierName}</span>}
          </div>

          {awbCode && (
            <div className="awb-row">
              <span className="awb-label">AWB</span>
              <span className="awb-code">{awbCode}</span>
            </div>
          )}

          {expectedDeliveryDate && (
            <div className="etd-row">
              <Icon icon="lucide:calendar-check" />
              <span>Expected delivery: <strong>{expectedDeliveryDate}</strong></span>
            </div>
          )}

          {trackLoading && <div className="track-loading"><span>Fetching live tracking...</span></div>}
          {trackError && <div className="track-error"><Icon icon="lucide:alert-circle" />{trackError}</div>}
          {!trackLoading && !trackError && <TrackingTimeline activities={activities} />}
        </div>
      )}
    </article>
  );
};

export default function MyOrders() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
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

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setModalSubmitLoading(true);
    const { type, orderId, itemId, itemName } = actionModal;
    const finalReason = actionForm.comments.trim() 
      ? `${actionForm.reason} - ${actionForm.comments.trim()}`
      : actionForm.reason;

    try {
      if (type === "cancel_item") {
        await api.post(`/api/orders/${orderId}/items/${itemId}/cancel`, { reason: finalReason });
        showNotification(`${itemName} cancelled successfully.`, "success");
      } else if (type === "cancel_order") {
        const response = await api.post(`/api/orders/${orderId}/cancel`, { reason: finalReason });
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

  return (
    <div className="my-orders-page">
      <section className="orders-hero">
        <div className="orders-hero-content">
          <h1>Your Orders</h1>
          <span>{orders.length ? `${orders.length} order${orders.length === 1 ? "" : "s"}` : "Track your orders here"}</span>
        </div>
      </section>

      <main className="orders-container">
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
            <div className="orders-count"><Icon icon="lucide:layers" />{orders.length} {orders.length === 1 ? "Order" : "Orders"}</div>
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onOrderUpdated={fetchOrders}
                showNotification={showNotification}
                onActionTrigger={handleActionTrigger}
              />
            ))}
          </div>
        )}
      </main>

      {actionModal.isOpen && (() => {
        const type = actionModal.type;
        const isReturn = type === "return";
        const isExchange = type === "exchange";
        const isCancelReturn = type === "cancel_return";
        const isCancelExchange = type === "cancel_exchange";

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
                    placeholder="Bhai, details yahan likh sakte ho (optional)..."
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
