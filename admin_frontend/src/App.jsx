import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Layout from "./layout/Layout";
import Dashboard from "./pages/Dashboard/Dashboard";
import Users from "./pages/Users/Users";
import Products from "./pages/Products/Products";
import Varieties from "./pages/Varieties/Varieties";
import Sizes from "./pages/Sizes/Sizes";
import Colors from "./pages/Colors/Colors";
import Fabrics from "./pages/Fabrics/Fabrics";
import EnhancedCoupons from "./pages/Coupons/EnhancedCoupons";
import Occasions from "./pages/Occasions/Occasions";
import Orders from "./pages/Orders/Orders";
import Inventory from "./pages/Inventory/Inventory";
import Reviews from "./pages/Reviews/Reviews";
import Analytics from "./pages/Analytics/Analytics";
import Payments from "./pages/Payments/Payments";
import Login from "./pages/Auth/Login";
import Profile from "./pages/Profile/Profile";
import OrderActions from "./pages/OrderActions/OrderActions";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to={localStorage.getItem('accessToken') ? '/dashboard' : '/login'} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
          <Route path="/varieties" element={<ProtectedRoute><Varieties /></ProtectedRoute>} />
          <Route path="/sizes" element={<ProtectedRoute><Sizes /></ProtectedRoute>} />
          <Route path="/colors" element={<ProtectedRoute><Colors /></ProtectedRoute>} />
          <Route path="/fabrics" element={<ProtectedRoute><Fabrics /></ProtectedRoute>} />
          <Route path="/coupons" element={<ProtectedRoute><EnhancedCoupons /></ProtectedRoute>} />
          <Route path="/occasions" element={<ProtectedRoute><Occasions /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/cancellations" element={<ProtectedRoute><OrderActions type="cancel" /></ProtectedRoute>} />
          <Route path="/returns" element={<ProtectedRoute><OrderActions type="return" /></ProtectedRoute>} />
          <Route path="/exchanges" element={<ProtectedRoute><OrderActions type="exchange" /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
          <Route path="/reviews" element={<ProtectedRoute><Reviews /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
        </Routes>
      </Layout>
    </Router>
  );
}
