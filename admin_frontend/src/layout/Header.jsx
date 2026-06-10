import { Link, useNavigate } from 'react-router-dom';
import { Home, ChevronRight, Bell, LogOut, Menu } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';

export default function Header({ currentSection, onMenuToggle }) {
  const navigate = useNavigate();
  const formattedSection = currentSection.charAt(0).toUpperCase() + currentSection.slice(1).replace('-', ' ');
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
  const adminName = adminUser?.name || 'Admin';

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await fetch(`${API_ENDPOINTS.auth}/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // proceed with local logout even if request fails
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('admin_user');
      navigate('/login');
    }
  };

  return (
    <header className="h-16 bg-white border-b border-[#D4AF37]/10 px-4 md:px-8 flex items-center justify-between shadow-sm z-40">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuToggle}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
          <Home className="w-4 h-4 text-[#D4AF37] hidden sm:block" />
          <span className="hidden sm:block">Admin</span>
          <ChevronRight className="w-4 h-4 hidden sm:block" />
          <span className="text-[#800020]">{formattedSection}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative w-9 h-9 rounded-full bg-[#FAF8F6] border border-[#D4AF37]/10 flex items-center justify-center hover:bg-[#D4AF37]/10 transition-all">
          <Bell className="w-5 h-5 text-gray-500" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-[#800020] rounded-full"></span>
        </button>
        <Link to="/profile" className="flex items-center gap-3 pl-4 border-l border-[#D4AF37]/10 hover:opacity-80 transition-opacity">
          <div className="text-right">
            <p className="text-xs font-bold text-[#4A3F35]">{adminName}</p>
            <p className="text-[10px] text-[#D4AF37] font-bold">Admin</p>
          </div>
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(adminName)}&background=800020&color=fff&size=100`}
            alt="Admin"
            className="w-9 h-9 rounded-full border border-[#D4AF37]/30"
          />
        </Link>
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-9 h-9 rounded-full bg-[#FAF8F6] border border-[#D4AF37]/10 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-all"
        >
          <LogOut className="w-4 h-4 text-gray-500 hover:text-red-500" />
        </button>
      </div>
    </header>
  );
}
