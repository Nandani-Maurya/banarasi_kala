import { Icon } from "@iconify/react";
import Header from "./Header";
import Footer from "./Footer";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import "./Layout.css";

const WHATSAPP_NUMBER = "919555098884";
const WHATSAPP_TEXT = encodeURIComponent("Hi Banarasi Kala, I need quick help.");
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_TEXT}`;
const SIGNUP_POPUP_INITIAL_DELAY = 10000;
const SIGNUP_POPUP_REPEAT_DELAY = 300000;

const WhatsappFloatingSupport = ({ hidden = false }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!hidden) setIsVisible(true);
  }, [hidden]);

  useEffect(() => {
    if (hidden || isVisible) return undefined;

    const timer = window.setTimeout(() => {
      setIsVisible(true);
    }, 60000);

    return () => window.clearTimeout(timer);
  }, [hidden, isVisible]);

  if (hidden || !isVisible) return null;

  return (
    <aside className="bk-whatsapp-float" aria-label="WhatsApp support">
      <button
        type="button"
        className="bk-whatsapp-close"
        onClick={() => setIsVisible(false)}
        aria-label="Close WhatsApp support"
      >
        <Icon icon="lucide:x" />
      </button>

      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="bk-whatsapp-link"
        aria-label="Chat with Banarasi Kala on WhatsApp"
      >
        <span className="bk-whatsapp-icon">
          <Icon icon="logos:whatsapp-icon" />
        </span>
        <span className="bk-whatsapp-copy">
          <strong>Need quick help?</strong>
          <small>Chat on WhatsApp</small>
        </span>
      </a>
    </aside>
  );
};

const SignupGiftPopup = ({ hidden = false }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (hidden) {
      setIsVisible(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIsVisible(true);
    }, SIGNUP_POPUP_INITIAL_DELAY);

    return () => window.clearTimeout(timer);
  }, [hidden]);

  useEffect(() => {
    if (hidden || isVisible) return undefined;

    const timer = window.setTimeout(() => {
      setIsVisible(true);
    }, SIGNUP_POPUP_REPEAT_DELAY);

    return () => window.clearTimeout(timer);
  }, [hidden, isVisible]);

  if (hidden || !isVisible) return null;

  return (
    <aside className="bk-signup-gift" role="dialog" aria-modal="false" aria-labelledby="bk-signup-gift-title">
      <button
        type="button"
        className="bk-signup-gift-close"
        onClick={() => setIsVisible(false)}
        aria-label="Close sign up offer"
      >
        <Icon icon="lucide:x" />
      </button>

      <span className="bk-signup-gift-kicker">Welcome Gift</span>
      <h2 id="bk-signup-gift-title">Rs.100 in your wallet</h2>
      <p>Sign up today and start your first Banarasi Kala order with a little extra joy.</p>

      <Link className="bk-signup-gift-action" to="/login?mode=signup">
        Claim now
        <Icon icon="lucide:arrow-right" />
      </Link>

      <span className="bk-signup-gift-note">Plus complimentary shipping on your first order</span>
    </aside>
  );
};

const Layout = () => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const [isRouteRefreshing, setIsRouteRefreshing] = useState(false);
  const footerlessAuthPages = ["/cart", "/wishlist", "/contact", "/feedback", "/profile"];
  const footerlessPages = ["/cart", "/wishlist", "/my-orders", "/profile"];
  const chromeHiddenPages = ["/checkout"];
  const hideChrome = chromeHiddenPages.includes(location.pathname);
  const hideFooter =
    hideChrome ||
    location.pathname === "/login" ||
    footerlessPages.includes(location.pathname) ||
    (!user && footerlessAuthPages.includes(location.pathname));
  const isHomePage = location.pathname === "/";
  const hideWhatsapp = hideChrome || location.pathname === "/contact";
  const hideSignupGift = hideChrome || loading || Boolean(user) || location.pathname === "/login";
  const routeRefreshKey = [
    location.pathname,
    location.search,
    location.hash,
  ].join("|");

  useEffect(() => {
    if (!location.state?.refreshKey) return undefined;
    setIsRouteRefreshing(true);
    const timer = window.setTimeout(() => setIsRouteRefreshing(false), 520);
    return () => window.clearTimeout(timer);
  }, [location.state?.refreshKey]);

  return (
    <>
      {!hideChrome && <Header />}
      <div
        className={`bk-layout-content ${
          isHomePage ? "bk-layout-content-home" : ""
        } ${isRouteRefreshing ? "bk-layout-refreshing" : ""}`}
      >
        {isRouteRefreshing && <div className="bk-route-refresh-veil" aria-hidden="true" />}
        <Outlet key={routeRefreshKey} />
      </div>
      <SignupGiftPopup hidden={hideSignupGift} />
      <WhatsappFloatingSupport hidden={hideWhatsapp} />
      {!hideFooter && <Footer />}
    </>
  );
};

export default Layout;
