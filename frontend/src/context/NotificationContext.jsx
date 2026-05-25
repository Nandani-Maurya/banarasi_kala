import { Icon } from "@iconify/react";
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [notification, setNotification] = useState(null);
  const timerRef = useRef(null);

  const showNotification = useCallback((message, type = 'success') => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    setNotification({ message, type });
    timerRef.current = window.setTimeout(() => {
      setNotification(null);
      timerRef.current = null;
    }, 3200);
  }, []);

  const getToastStyle = (type) => {
    if (type === "success") {
      return {
        shell: "border-emerald-200 bg-white text-[#24392d] shadow-[0_14px_34px_rgba(20,83,45,0.14)]",
        icon: "bg-emerald-50 text-emerald-700",
        glyph: "lucide:check",
      };
    }
    if (type === "error") {
      return {
        shell: "border-red-200 bg-white text-[#4a1d1d] shadow-[0_14px_34px_rgba(127,29,29,0.14)]",
        icon: "bg-red-50 text-red-700",
        glyph: "lucide:alert-circle",
      };
    }
    return {
      shell: "border-amber-200 bg-white text-[#4a3517] shadow-[0_14px_34px_rgba(146,64,14,0.14)]",
      icon: "bg-amber-50 text-amber-700",
      glyph: "lucide:info",
    };
  };

  const toastStyle = notification ? getToastStyle(notification.type) : null;

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {notification && (
        <div
          className="pointer-events-none animate-slide-up-fade"
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10000,
            width: "min(320px, calc(100vw - 32px))",
          }}
        >
          <div className={`pointer-events-auto w-full rounded-xl border px-3.5 py-3 flex items-start gap-3 transition-all duration-300 ${toastStyle.shell}`}>
            <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${toastStyle.icon}`}>
              <Icon 
                icon={toastStyle.glyph}
                className="text-base"
              ></Icon>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <span className="block text-sm font-medium leading-snug">
                {notification.message}
              </span>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#7a6b5c] hover:bg-[#f7efe4] transition-colors"
              aria-label="Close notification"
            >
              <Icon icon="lucide:x" className="text-sm"></Icon>
            </button>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

