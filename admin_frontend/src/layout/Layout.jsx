import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ children }) {
  const location = useLocation();
  const currentSection = location.pathname.split('/')[1] || 'dashboard';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAuthenticated = !!localStorage.getItem('accessToken');

  if (currentSection === 'login' || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F5F1ED] text-[#4A3F35]">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen overflow-hidden bg-[#F5F1ED] text-[#4A3F35]">
      <Sidebar
        currentSection={currentSection}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 flex flex-col min-w-0">
        <Header
          currentSection={currentSection}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />
        <div id="content-viewport" className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
