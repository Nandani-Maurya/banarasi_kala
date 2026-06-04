import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import Layout from "./layout/Layout";
import ScrollToTop from "./components/ScrollToTop";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { NotificationProvider } from "./context/NotificationContext";
import PreLoader from "./components/PreLoader/PreLoader";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import headerBackground from "./assets/header_backgroung.png";
import "./App.css";

const Home = lazy(() => import("./pages/Home/Home"));
const Collection = lazy(() => import("./pages/Collection/Collection"));
const ProductDetail = lazy(() => import("./pages/ProductDetail/ProductDetail"));
const Cart = lazy(() => import("./pages/Cart/Cart"));
const Checkout = lazy(() => import("./pages/Checkout/Checkout"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation/OrderConfirmation"));
const Auth = lazy(() => import("./pages/Auth/Auth"));
const About = lazy(() => import("./pages/About/About"));
const Testimonials = lazy(() => import("./pages/Testimonials/Testimonials"));
const Wishlist = lazy(() => import("./pages/Wishlist/Wishlist"));
const MyOrders = lazy(() => import("./pages/MyOrders/MyOrders"));
const Contact = lazy(() => import("./pages/Contact/Contact"));
const Feedback = lazy(() => import("./pages/Feedback/Feedback"));
const Profile = lazy(() => import("./pages/Profile/Profile"));
const NotFound = lazy(() => import("./pages/NotFound/NotFound"));



function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <WishlistProvider>
          <CartProvider>
            <Router>
              <ScrollToTop />
              <div
                className="App"
                style={{
                  "--bk-section-bg": `url(${headerBackground})`,
                  "--bk-header-bg": `url(${headerBackground})`,
                }}
              >
                <ErrorBoundary>
                <Suspense fallback={<PreLoader />}>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route path="/" element={<Home />} />
                      <Route path="/collection" element={<Collection />} />
                      <Route path="/product/:slug" element={<ProductDetail />} />
                      <Route
                        path="/cart"
                        element={
                          <ProtectedRoute>
                            <Cart />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/checkout"
                        element={
                          <ProtectedRoute>
                            <Checkout />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/wishlist"
                        element={
                          <ProtectedRoute>
                            <Wishlist />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/my-orders"
                        element={
                          <ProtectedRoute>
                            <MyOrders />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/profile"
                        element={
                          <ProtectedRoute>
                            <Profile />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/order-confirmation"
                        element={
                          <ProtectedRoute>
                            <OrderConfirmation />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/about" element={<About />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/feedback" element={<Feedback />} />
                      <Route path="/testimonials" element={<Testimonials />} />
                      <Route path="/login" element={<Auth />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
                </ErrorBoundary>
              </div>
              <Toaster
                position="top-center"
                toastOptions={{
                  duration: 3200,
                  style: {
                    background: "#1a0a06",
                    color: "#fff6e8",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    fontSize: "13px",
                    fontWeight: "600",
                    padding: "12px 16px",
                    boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
                  },
                  success: {
                    iconTheme: { primary: "#4ade80", secondary: "#1a0a06" },
                  },
                  error: {
                    iconTheme: { primary: "#f87171", secondary: "#1a0a06" },
                  },
                }}
              />
            </Router>
          </CartProvider>
        </WishlistProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
