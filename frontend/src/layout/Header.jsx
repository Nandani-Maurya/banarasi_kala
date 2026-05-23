import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { API_ENDPOINTS } from "../config/api";
import verticalLogo from "../assets/vertical_logo.png";
import headerBackground from "../assets/header_backgroung.png";
import "./Header.css";

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { getCartCount } = useCart();
  const { getWishlistCount } = useWishlist();

  const [sareeOpen, setSareeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const [sareeVarieties, setSareeVarieties] = useState([]);
  const [sareeVarietiesStatus, setSareeVarietiesStatus] = useState("idle");
  const sareeMenuRef = useRef(null);
  const profileMenuRef = useRef(null);
  const mobilePanelRef = useRef(null);
  const mobileMenuButtonRef = useRef(null);

  const isAuthPage = location.pathname === "/login";
  const userName = user?.name || "User";
  const firstName = userName.split(" ")[0];
  const userPhone = user?.phone || "Welcome to Banarasi Kala";

  useEffect(() => {
    if (location.pathname !== "/collection") return;
    const query = new URLSearchParams(location.search).get("search") || "";
    setHeaderSearch(query);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchSareeVarieties = async () => {
      setSareeVarietiesStatus("loading");

      try {
        const response = await fetch(
          API_ENDPOINTS.varieties,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Unable to load saree varieties");
        }

        const data = await response.json();
        const varieties = Array.isArray(data)
          ? data
              .filter((item) => item?.id && item?.name)
              .map((item) => ({
                id: item.id,
                name: item.name,
              }))
          : [];

        setSareeVarieties(varieties);
        setSareeVarietiesStatus("success");
      } catch (error) {
        if (error.name !== "AbortError") {
          setSareeVarieties([]);
          setSareeVarietiesStatus("error");
        }
      }
    };

    fetchSareeVarieties();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnOutsideTap = (event) => {
      const target = event.target;
      if (
        mobilePanelRef.current?.contains(target) ||
        mobileMenuButtonRef.current?.contains(target)
      ) {
        return;
      }

      setMobileMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideTap);
    document.addEventListener("touchstart", closeOnOutsideTap, { passive: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("mousedown", closeOnOutsideTap);
      document.removeEventListener("touchstart", closeOnOutsideTap);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const closeFloatingMenus = (event) => {
      if (
        sareeMenuRef.current &&
        !sareeMenuRef.current.contains(event.target)
      ) {
        setSareeOpen(false);
      }

      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setProfileOpen(false);
        setSareeOpen(false);
      }
    };

    document.addEventListener("mousedown", closeFloatingMenus);
    document.addEventListener("touchstart", closeFloatingMenus);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeFloatingMenus);
      document.removeEventListener("touchstart", closeFloatingMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const closeMenuWhenFocusLeaves = (event, closeMenu) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      closeMenu(false);
    }
  };

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setSareeOpen(false);
  };

  const handleHeaderSearch = (e) => {
    e.preventDefault();
    const q = headerSearch.trim();
    const targetPath = q ? `/collection?search=${encodeURIComponent(q)}` : "/collection";
    const currentPath = `${location.pathname}${location.search}`;
    navigate(targetPath, {
      replace: currentPath === targetPath,
      state: currentPath === targetPath ? { refreshKey: Date.now() } : undefined,
    });
    closeMenus();
  };

  const handleLogout = () => {
    logout();
    closeMenus();
    navigate("/", { state: { refreshKey: Date.now() } });
  };

  const goProtected = (path) => {
    closeMenus();
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(path, {
      replace: currentPath === path,
      state: currentPath === path ? { refreshKey: Date.now() } : undefined,
    });
  };

  const openLogin = (event) => {
    event.preventDefault();
    closeMenus();
    window.dispatchEvent(new Event("auth:refresh"));
    const targetPath = "/login?refresh=login";
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(targetPath, {
      replace: currentPath === targetPath,
      state: currentPath === targetPath ? { refreshKey: Date.now() } : undefined,
    });
  };

  const scrollForTarget = (target) => {
    if (target.hash) {
      const section = document.querySelector(target.hash);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }

    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const refreshNavClick = (to) => (event) => {
    closeMenus();

    const target = new URL(to, window.location.origin);
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    const targetPath = `${target.pathname}${target.search}${target.hash}`;

    if (currentPath === targetPath) {
      event.preventDefault();
      navigate(to, {
        replace: true,
        state: { refreshKey: Date.now() },
      });
      window.setTimeout(() => scrollForTarget(target), 40);
    }
  };

  return (
    <header
      className="bk-header"
      style={{ "--bk-header-bg": `url(${headerBackground})` }}
    >
      <div className="bk-topline" aria-hidden="true">
        <div className="bk-topline-track">
          {[...Array(4)].map((_, index) => (
            <p key={index}>
              <span>Free shipping on your first order!</span>
              <span className="bk-topline-separator" aria-hidden="true" />
              <span>Grab Rs.100 in your wallet right after sign up</span>
            </p>
          ))}
        </div>
      </div>

      <div className="bk-header-shell">
        <button
          ref={mobileMenuButtonRef}
          type="button"
          className="bk-mobile-menu"
          aria-label="Open menu"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className="bk-nav" aria-label="Primary navigation">
          <Link to="/" onClick={refreshNavClick("/")}>Home</Link>
          <div
            ref={sareeMenuRef}
            className="bk-saree-menu"
            onMouseEnter={() => setSareeOpen(true)}
            onMouseLeave={() => setSareeOpen(false)}
            onFocus={() => setSareeOpen(true)}
            onBlur={(event) => closeMenuWhenFocusLeaves(event, setSareeOpen)}
          >
            <button type="button">
              Sarees
              <svg
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {sareeOpen && (
              <div className="bk-dropdown">
                {sareeVarietiesStatus === "loading" && (
                  <span className="bk-dropdown-status">Loading sarees...</span>
                )}
                {sareeVarietiesStatus === "error" && (
                  <span className="bk-dropdown-status">Unable to load sarees</span>
                )}
                {sareeVarietiesStatus === "success" &&
                  sareeVarieties.map((variety) => (
                    <Link
                      key={variety.id}
                      to={`/collection?variety=${variety.id}`}
                      onClick={refreshNavClick(`/collection?variety=${variety.id}`)}
                    >
                      {variety.name}
                    </Link>
                  ))}
                {sareeVarietiesStatus === "success" &&
                  sareeVarieties.length === 0 && (
                    <span className="bk-dropdown-status">No sarees found</span>
                  )}
              </div>
            )}
          </div>
          <Link to="/#new-arrivals" onClick={refreshNavClick("/#new-arrivals")}>New Arrivals</Link>
          <Link to="/collection" onClick={refreshNavClick("/collection")}>Collections</Link>
          <Link to="/about" onClick={refreshNavClick("/about")}>About Us</Link>
          <Link to="/contact" onClick={refreshNavClick("/contact")}>Contact Us</Link>
        </nav>

        <Link
          to="/"
          className="bk-logo-link"
          aria-label="Banarasi Kala home"
          onClick={refreshNavClick("/")}
        >
          <img src={verticalLogo} alt="Banarasi Kala" className="bk-logo" />
        </Link>

        <div className="bk-actions">
          <form
            className="bk-search bk-search-desktop"
            onSubmit={handleHeaderSearch}
          >
            <input
              type="search"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              placeholder="Search for Banarasi Sarees"
            />
            <button type="submit" aria-label="Search">
              <svg
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </form>

          {!isAuthPage && (
            <div
              ref={profileMenuRef}
              className="bk-profile-menu"
              onMouseEnter={() => setProfileOpen(true)}
              onMouseLeave={() => setProfileOpen(false)}
              onFocus={() => setProfileOpen(true)}
              onBlur={(event) => closeMenuWhenFocusLeaves(event, setProfileOpen)}
            >
              {user ? (
                <button
                  type="button"
                  className="bk-icon-link bk-profile-trigger"
                  aria-expanded={profileOpen}
                  aria-label="Profile menu"
                >
                  <span className="bk-icon-wrap">
                    <svg
                      width="29"
                      height="29"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      viewBox="0 0 24 24"
                    >
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <span>Profile</span>
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={openLogin}
                  className="bk-icon-link"
                  aria-label="Login"
                >
                  <span className="bk-icon-wrap">
                    <svg
                      width="29"
                      height="29"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      viewBox="0 0 24 24"
                    >
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <path d="M10 17l5-5-5-5" />
                      <path d="M15 12H3" />
                    </svg>
                  </span>
                  <span>Login</span>
                </Link>
              )}

              {profileOpen && user && (
                <div className="bk-profile-panel">
                  <div className="bk-profile-head">
                    <p>Hello {firstName}</p>
                    <span>{userPhone}</span>
                  </div>
                  <button type="button" onClick={() => goProtected("/my-orders")}>
                    Orders
                  </button>
                  <button type="button" onClick={() => goProtected("/profile")}>
                    Account
                  </button>
                  <button type="button" onClick={() => goProtected("/wishlist")}>
                    Wishlist
                  </button>
                  <button type="button" onClick={() => goProtected("/feedback")}>
                    Feedback
                  </button>
                  <button type="button" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}

          {user && (
            <button
              type="button"
              onClick={() => goProtected("/wishlist")}
              className="bk-icon-link bk-wishlist-action"
              aria-label="Wishlist"
            >
              <span className="bk-icon-wrap">
                <svg
                  width="29"
                  height="29"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l7.78-7.78a5.5 5.5 0 0 0 1.06-8.84z" />
                </svg>
                {getWishlistCount() > 0 && (
                  <span className="bk-count">{getWishlistCount()}</span>
                )}
              </span>
              <span>Wishlist</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => goProtected("/cart")}
            className="bk-icon-link"
            aria-label="Cart"
          >
            <span className="bk-icon-wrap">
              <svg
                width="29"
                height="29"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                viewBox="0 0 24 24"
              >
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              {getCartCount() > 0 && (
                <span className="bk-count">{getCartCount()}</span>
              )}
            </span>
            <span>Cart</span>
          </button>
        </div>

        <form className="bk-search bk-search-mobile" onSubmit={handleHeaderSearch}>
          <button type="submit" aria-label="Search">
            <svg
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <input
            type="search"
            value={headerSearch}
            onChange={(e) => setHeaderSearch(e.target.value)}
            placeholder="Search for Banarasi Sarees"
          />
        </form>
      </div>

      {mobileMenuOpen && (
        <nav ref={mobilePanelRef} className="bk-mobile-panel" aria-label="Mobile navigation">
          <div className="bk-mobile-panel-head">
            <span>{user ? `Hello ${firstName}` : "Welcome"}</span>
            <p>{user ? userPhone : "Sign in for orders, wishlist and cart"}</p>
          </div>

          <div className="bk-mobile-panel-section">
            <span className="bk-mobile-panel-title">Menu</span>
            <Link to="/" onClick={refreshNavClick("/")}>
              Home
            </Link>
            <Link to="/#new-arrivals" onClick={refreshNavClick("/#new-arrivals")}>
              New Arrivals
            </Link>
            <Link to="/collection" onClick={refreshNavClick("/collection")}>
              Collections
            </Link>
            <Link to="/about" onClick={refreshNavClick("/about")}>
              About Us
            </Link>
            <Link to="/contact" onClick={refreshNavClick("/contact")}>
              Contact Us
            </Link>
          </div>

          <div className="bk-mobile-panel-section">
            <span className="bk-mobile-panel-title">Sarees</span>
            <Link to="/collection" onClick={refreshNavClick("/collection")}>
              All Sarees
            </Link>
            {sareeVarietiesStatus === "loading" && (
              <span className="bk-mobile-panel-muted">Loading sarees...</span>
            )}
            {sareeVarietiesStatus === "success" &&
              sareeVarieties.slice(0, 8).map((variety) => (
                <Link
                  key={variety.id}
                  to={`/collection?variety=${variety.id}`}
                  onClick={refreshNavClick(`/collection?variety=${variety.id}`)}
                >
                  {variety.name}
                </Link>
              ))}
            {sareeVarietiesStatus === "success" && sareeVarieties.length > 8 && (
              <Link to="/collection" onClick={refreshNavClick("/collection")}>
                View All Sarees
              </Link>
            )}
            {sareeVarietiesStatus === "error" && (
              <span className="bk-mobile-panel-muted">Unable to load sarees</span>
            )}
          </div>

          <div className="bk-mobile-panel-section">
            <span className="bk-mobile-panel-title">Account</span>
            {user ? (
              <>
                <button type="button" onClick={() => goProtected("/my-orders")}>
                  Orders
                </button>
                <button type="button" onClick={() => goProtected("/wishlist")}>
                  Wishlist {getWishlistCount() > 0 ? `(${getWishlistCount()})` : ""}
                </button>
                <button type="button" onClick={() => goProtected("/cart")}>
                  Cart {getCartCount() > 0 ? `(${getCartCount()})` : ""}
                </button>
                <button type="button" onClick={() => goProtected("/feedback")}>
                  Feedback
                </button>
                <button type="button" className="bk-mobile-logout" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : (
              <Link className="bk-mobile-login" to="/login" onClick={openLogin}>
                Login / Sign Up
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
};

export default Header;
