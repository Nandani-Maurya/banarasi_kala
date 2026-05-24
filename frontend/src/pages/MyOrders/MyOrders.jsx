import { Icon } from "@iconify/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import API_ENDPOINTS from "../../config/api";
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

const getStatus = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
const toNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};
const formatPrice = (value) => `Rs. ${toNumber(value).toLocaleString("en-IN")}`;
const getItemImage = (item) => item.image_url || item.product_image_url || "";
const getItemColorLabel = (item) => item.color_name || item.Color?.name || "Selected color";
const isCancelled = (order) => String(order.status || "").toLowerCase() === "cancelled";

const getOrderBreakdown = (order) => {
  const items = order.OrderItems || [];
  const itemSubtotal = items.reduce(
    (sum, item) => sum + toNumber(item.price) * Math.max(1, toNumber(item.quantity) || 1),
    0,
  );
  const subtotal = toNumber(order.subtotal_amount) || itemSubtotal;
  const shippingCharge = toNumber(order.shipping_charge);
  const shippingDiscount = toNumber(order.shipping_discount);
  const couponDiscount = toNumber(order.discount_amount);
  const walletAmount = toNumber(order.wallet_amount);
  const payable = toNumber(order.payable_amount) || toNumber(order.total_amount) || Math.max(
    0,
    subtotal + shippingCharge - shippingDiscount - couponDiscount - walletAmount,
  );

  return {
    subtotal,
    shippingCharge,
    shippingDiscount,
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

const OrderCard = ({ order, userEmail, onOrderUpdated, showNotification }) => {
  const [expanded, setExpanded] = useState(false);
  const [tracking, setTracking] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState(null);
  const [returnLoading, setReturnLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const statusConfig = getStatus(order.status);
  const items = order.OrderItems || [];
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
      const response = await fetch(API_ENDPOINTS.trackOrder(order.id));
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Could not load tracking info.");
      setTracking(data);
    } catch (error) {
      setTrackError(error.message || "Could not load tracking info. Please try again.");
    } finally {
      setTrackLoading(false);
    }
  }, [order.id, tracking, trackLoading]);

  const handleExpand = () => {
    const nextState = !expanded;
    setExpanded(nextState);
    if (nextState) loadTracking();
  };

  const handleCancel = async () => {
    if (!window.confirm("Cancel this order? Refund will be processed in 1-2 days for paid orders.")) return;
    setCancelLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.cancelOrder(order.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Unable to cancel order.");
      showNotification(data?.refund_message || "Order cancelled successfully.", "success");
      onOrderUpdated?.();
    } catch (error) {
      showNotification(error.message || "Unable to cancel order.", "error");
    } finally {
      setCancelLoading(false);
    }
  };

  const activities = tracking?.tracking?.tracking_data?.shipment_track_activities || [];
  const etd = tracking?.tracking?.tracking_data?.etd;
  const courierName = tracking?.tracking?.tracking_data?.shipment_track?.[0]?.courier_name;
  const awbCode = tracking?.tracking?.tracking_data?.shipment_track?.[0]?.awb_code;
  const canRequestReturn = String(order.status).toLowerCase() === "delivered";

  const handleReturnRequest = async () => {
    const reason = window.prompt("Return reason likhiye (optional):", "Size issue");
    if (reason === null) return;
    setReturnLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.createReturn, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, reason: reason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Return request failed");
      showNotification("Return request submitted successfully.", "success");
      onOrderUpdated?.();
    } catch (error) {
      showNotification(error.message || "Unable to create return request", "error");
    } finally {
      setReturnLoading(false);
    }
  };

  return (
    <article className={`order-card ${isCancelled(order) ? "is-cancelled" : ""}`}>
      <div className="order-card-header">
        <div className="order-meta">
          <span className="order-number">Order #{order.id}</span>
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
          <small>{items.length} {items.length === 1 ? "item" : "items"}</small>
        </div>

        {items.map((item, index) => {
          const imageUrl = getItemImage(item);
          const colorHex = item.color_hex || item.Color?.hex_code || "#b7822d";
          const lineTotal = toNumber(item.price) * Math.max(1, toNumber(item.quantity) || 1);
          const productName = item.product_name || `Product #${item.product_id}`;

          return (
            <div key={`${item.product_id}-${item.colorId || index}`} className="order-product-item">
              <div className="order-product-media">
                {imageUrl ? (
                  <img src={imageUrl} alt={productName} loading="lazy" />
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
                  <span className="order-dot" />
                  <span>{formatPrice(item.price)} each</span>
                </div>
                <div className="order-product-color">
                  <span className="order-color-swatch" style={{ backgroundColor: colorHex }} />
                  <span>{getItemColorLabel(item)}</span>
                </div>
              </div>

              <span className="order-line-total">{formatPrice(lineTotal)}</span>
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
        <button className={`order-action-btn primary ${expanded ? "active" : ""}`} onClick={handleExpand} type="button">
          <Icon icon={expanded ? "lucide:chevron-up" : "lucide:map-pin"} />
          {expanded ? "Hide tracking" : "Track order"}
        </button>
        {canRequestReturn && (
          <button className="order-action-btn" onClick={handleReturnRequest} type="button" disabled={returnLoading}>
            <Icon icon="lucide:rotate-ccw" />
            {returnLoading ? "Submitting..." : "Request return"}
          </button>
        )}
        {cancellationAvailable ? (
          <button className="order-action-btn danger" onClick={handleCancel} type="button" disabled={cancelLoading}>
            <Icon icon="lucide:x" />
            {cancelLoading ? "Cancelling..." : "Cancel order"}
          </button>
        ) : (
          !isCancelled(order) && <span className="cancel-window-note">Cancellation available within 24 hours only.</span>
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

          {etd && (
            <div className="etd-row">
              <Icon icon="lucide:calendar-check" />
              <span>Expected delivery: <strong>{etd}</strong></span>
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

  const fetchOrders = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ENDPOINTS.myOrders(user.email));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || "Failed to fetch orders");
      const data = Array.isArray(payload) ? payload : (payload?.data || []);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.email) {
      navigate("/login?refresh=my-orders");
      return;
    }
    fetchOrders();
  }, [user, navigate, fetchOrders]);

  return (
    <div className="my-orders-page">
      <section className="orders-hero">
        <div className="orders-hero-content">
          <span className="orders-hero-icon"><Icon icon="lucide:package-search" /></span>
          <div>
            <p className="orders-eyebrow">Banarasi Kala</p>
            <h1>My Orders</h1>
            <span>Track orders, payments and delivery in one place.</span>
          </div>
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
                userEmail={user?.email}
                onOrderUpdated={fetchOrders}
                showNotification={showNotification}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
