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

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/products" element={<Products />} />
          <Route path="/varieties" element={<Varieties />} />
          <Route path="/sizes" element={<Sizes />} />
          <Route path="/colors" element={<Colors />} />
          <Route path="/fabrics" element={<Fabrics />} />
          <Route path="/coupons" element={<EnhancedCoupons />} />
          <Route path="/occasions" element={<Occasions />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/cancellations" element={<OrderActions type="cancel" />} />
          <Route path="/returns" element={<OrderActions type="return" />} />
          <Route path="/exchanges" element={<OrderActions type="exchange" />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/payments" element={<Payments />} />
        </Routes>
      </Layout>
    </Router>
  );
}
