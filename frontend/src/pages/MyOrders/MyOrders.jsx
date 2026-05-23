import { Icon } from "@iconify/react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import API_ENDPOINTS from "../../config/api";
import EmptyStateIcon from "../../components/EmptyStateIcon";
import "./MyOrders.css";

const STATUS_CONFIG = {
  Pending: { color: "#B7791F", bg: "#FFF7D6", icon: "lucide:clock", label: "Order Placed" },
  Processing: { color: "#2563EB", bg: "#EFF6FF", icon: "lucide:package", label: "Processing" },
  Shipped: { color: "#7C3AED", bg: "#F5F3FF", icon: "lucide:truck", label: "Shipped" },
  Delivered: { color: "#059669", bg: "#ECFDF5", icon: "lucide:check-circle", label: "Delivered" },
  Cancelled: { color: "#DC2626", bg: "#FEF2F2", icon: "lucide:x-circle", label: "Cancelled" },
  "Out For Delivery": { color: "#B7791F", bg: "#FFF7D6", icon: "lucide:navigation", label: "Out for Delivery" },
};

const getStatus = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
const formatPrice = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
const getItemImage = (item) => item.image_url || item.product_image_url || "";
const getItemColorLabel = (item) => item.color_name || item.Color?.name || "Selected color";

const TrackingTimeline = ({ activities = [] }) => {
  if (!activities.length) {
    return (
      <div className="tracking-empty">
        <Icon icon="lucide:map-pin-off"></Icon>
        <p>Tracking updates will appear once shipment is dispatched.</p>
      </div>
    );
  }

  return (
    <div className="tracking-timeline">
      {activities.map((activity, index) => (
        <div key={`${activity.activity || "step"}-${index}`} className={`timeline-item ${index === 0 ? "active" : ""}`}>
          <div className="timeline-dot"></div>
          {index < activities.length - 1 && <div className="timeline-line"></div>}
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

const OrderCard = ({ order }) => {
  const [expanded, setExpanded] = useState(false);
  const [tracking, setTracking] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState(null);

  const statusConfig = getStatus(order.status);
  const items = order.OrderItems || [];
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const loadTracking = useCallback(async () => {
    if (tracking || trackLoading) return;
    setTrackLoading(true);
    setTrackError(null);

    try {
      const response = await fetch(API_ENDPOINTS.trackOrder(order.id));
      const data = await response.json();
      setTracking(data);
    } catch {
      setTrackError("Could not load tracking info. Please try again.");
    } finally {
      setTrackLoading(false);
    }
  }, [order.id, tracking, trackLoading]);

  const handleExpand = () => {
    const nextState = !expanded;
    setExpanded(nextState);
    if (nextState) loadTracking();
  };

  const activities = tracking?.tracking?.tracking_data?.shipment_track_activities || [];
  const etd = tracking?.tracking?.tracking_data?.etd;
  const courierName = tracking?.tracking?.tracking_data?.shipment_track?.[0]?.courier_name;
  const awbCode = tracking?.tracking?.tracking_data?.shipment_track?.[0]?.awb_code;

  return (
    <article className="order-card">
      <div className="order-card-header">
        <div className="order-meta">
          <div className="order-id-wrap">
            <Icon icon="lucide:receipt-text"></Icon>
            <span className="order-id">Order #{order.id}</span>
          </div>
          <span className="order-date">{orderDate}</span>
        </div>

        <div className="order-status-badge" style={{ color: statusConfig.color, backgroundColor: statusConfig.bg }}>
          <Icon icon={statusConfig.icon}></Icon>
          {statusConfig.label}
        </div>
      </div>

      <div className="order-products">
        <div className="order-products-title">
          <span>Ordered Products</span>
          <small>{items.length} {items.length === 1 ? "item" : "items"}</small>
        </div>

        {items.map((item, index) => {
          const imageUrl = getItemImage(item);
          const colorHex = item.color_hex || item.Color?.hex_code || "#d8b46a";
          const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
          const productName = item.product_name || `Product #${item.product_id}`;

          return (
            <div key={`${item.product_id}-${item.colorId || index}`} className="order-product-item">
              <div className="order-product-media">
                {imageUrl ? (
                  <img src={imageUrl} alt={productName || `Product ${index + 1}`} loading="lazy" />
                ) : (
                  <div className="order-product-placeholder">
                    <Icon icon="lucide:image-off"></Icon>
                  </div>
                )}
                <span className="order-product-number">{String(index + 1).padStart(2, "0")}</span>
              </div>

              <div className="order-product-details">
                <div className="order-product-name-row">
                  <h3>{productName}</h3>
                  <span className="order-product-qty">Qty {item.quantity}</span>
                </div>

                <div className="order-product-color">
                  <span className="order-color-swatch" style={{ backgroundColor: colorHex }}></span>
                  <span>{getItemColorLabel(item)}</span>
                </div>

                <div className="order-product-price-row">
                  <span>{formatPrice(item.price)} each</span>
                  <strong>{formatPrice(lineTotal)}</strong>
                </div>
              </div>
            </div>
          );
        })}

        {!items.length && (
          <div className="order-products-empty">
            <Icon icon="lucide:package-open"></Icon>
            <span>Product details are not available for this order.</span>
          </div>
        )}
      </div>

      <div className="order-footer">
        <div className="order-total">
          <span className="total-label">Total Paid</span>
          <span className="total-amount">{formatPrice(order.total_amount)}</span>
          {Number(order.discount_amount) > 0 && (
            <span className="discount-saved">
              <Icon icon="lucide:tag"></Icon>
              Saved {formatPrice(order.discount_amount)}
            </span>
          )}
        </div>

        <button className={`track-btn ${expanded ? "active" : ""}`} onClick={handleExpand} type="button">
          <Icon icon={expanded ? "lucide:chevron-up" : "lucide:map-pin"}></Icon>
          {expanded ? "Hide Tracking" : "Track Order"}
        </button>
      </div>

      <div className="order-address">
        <Icon icon="lucide:map-pin"></Icon>
        <span>{order.address}, {order.city} - {order.pincode}</span>
      </div>

      {expanded && (
        <div className="tracking-panel">
          <div className="tracking-panel-header">
            <h4><Icon icon="lucide:truck"></Icon> Live Shipment Tracking</h4>
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
              <Icon icon="lucide:calendar-check"></Icon>
              <span>Expected Delivery: <strong>{etd}</strong></span>
            </div>
          )}

          {trackLoading && (
            <div className="track-loading">
              <div className="track-spinner"></div>
              <span>Fetching live tracking...</span>
            </div>
          )}

          {trackError && (
            <div className="track-error">
              <Icon icon="lucide:alert-circle"></Icon>
              {trackError}
            </div>
          )}

          {!trackLoading && !trackError && <TrackingTimeline activities={activities} />}
        </div>
      )}
    </article>
  );
};

export default function MyOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.email) {
      navigate("/login?refresh=my-orders");
      return;
    }

    let isMounted = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(API_ENDPOINTS.myOrders(user.email));
        if (!response.ok) throw new Error("Failed to fetch orders");
        const data = await response.json();
        if (isMounted) setOrders(Array.isArray(data) ? data : []);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user, navigate]);

  return (
    <div className="my-orders-page">
      <section className="orders-hero">
        <div className="orders-hero-content">
          <span className="orders-hero-icon">
            <Icon icon="lucide:package-search"></Icon>
          </span>
          <div>
            <p className="orders-eyebrow">Banarasi Kala</p>
            <h1>My Orders</h1>
            <span>Every saree you ordered, tracked with color, price and delivery updates.</span>
          </div>
        </div>
      </section>

      <main className="orders-container">
        {loading && (
          <div className="orders-loading">
            {[1, 2, 3].map((item) => (
              <div key={item} className="order-skeleton">
                <div className="skel skel-header"></div>
                <div className="skel skel-product"></div>
                <div className="skel skel-product short"></div>
                <div className="skel skel-footer"></div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="orders-error">
            <Icon icon="lucide:wifi-off"></Icon>
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
            <Link to="/collection" className="shop-now-btn">
              <Icon icon="lucide:sparkles"></Icon>
              Explore Collection
            </Link>
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <div className="orders-list">
            <div className="orders-count">
              <Icon icon="lucide:layers"></Icon>
              {orders.length} {orders.length === 1 ? "Order" : "Orders"}
            </div>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
