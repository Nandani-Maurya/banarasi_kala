import { Link, useNavigate } from "react-router-dom";
import { API_ENDPOINTS } from "../config/api";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  GitBranch,
  Palette,
  FileBadge,
  TicketPercent,
  Sparkles,
  Box,
  PackageCheck,
  MessageSquareText,
  BarChart3,
  CreditCard,
  LogOut,
  RotateCcw,
  RefreshCw,
  XCircle,
  X,
} from "lucide-react";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "varieties", label: "Varieties", subtext: "(Katan, Kadhwa, Tissue)", icon: GitBranch },
  { id: "fabrics", label: "Fabrics / Materials", subtext: "(Silk, Georgette, etc.)", icon: FileBadge },
  { id: "occasions", label: "Occasions", subtext: "(Wedding, Festival, etc.)", icon: Sparkles },
  { id: "colors", label: "Colors Palette", subtext: "(Red, Blue, Gold, etc.)", icon: Palette },
  { id: "coupons", label: "Coupons", subtext: "(Offers & Discounts)", icon: TicketPercent },
  { id: "products", label: "Products", subtext: "(Saree, Suit, Catalog)", icon: ShoppingBag },
  { id: "users", label: "User Management", icon: Users },
  { id: "orders", label: "Orders", icon: Box },
  { id: "cancellations", label: "Cancellations", icon: XCircle },
  { id: "returns", label: "Returns", icon: RotateCcw },
  { id: "exchanges", label: "Exchanges", icon: RefreshCw },
  { id: "inventory", label: "Inventory", icon: PackageCheck },
  { id: "reviews", label: "Reviews", icon: MessageSquareText, badge: 4 },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "payments", label: "Payments", icon: CreditCard },
];

export default function Sidebar({ currentSection, isOpen, onClose }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      if (token) {
        await fetch(`${API_ENDPOINTS.auth}/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // proceed with local logout even if request fails
    } finally {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("admin_user");
      navigate("/login");
    }
  };

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation
    if (window.innerWidth < 768) onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-[#FAF8F6] border-r border-[#D4AF37]/20 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:z-auto
        `}
      >
        {/* Header with close button on mobile */}
        <div className="p-6 mb-2 border-b border-[#D4AF37]/10 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="brand-font text-2xl font-bold tracking-tighter text-[#800020]">
              Banaras Kala
            </span>
            <span className="text-[9px] tracking-[0.3em] uppercase text-[#4A3F35]/60 font-bold">
              Admin Console
            </span>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto custom-scrollbar pt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            return (
              <Link
                key={item.id}
                to={`/${item.id}`}
                onClick={handleNavClick}
                className={`w-full sidebar-link flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-semibold ${
                  isActive ? "active" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-5 h-5" />
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  {item.subtext && (
                    <span className="text-[9px] text-gray-400 font-normal">
                      {item.subtext}
                    </span>
                  )}
                </div>
                {item.badge && (
                  <span className="ml-auto bg-[#800020] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#D4AF37]/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-[#800020]/20 text-[#800020] rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#800020] hover:text-white transition-all"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
