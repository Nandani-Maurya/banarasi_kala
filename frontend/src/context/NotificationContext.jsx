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
    const payload = typeof message === "object" && message !== null
      ? { ...message, type: message.type || type }
      : { message, type };
    setNotification(payload);
    timerRef.current = window.setTimeout(() => {
      setNotification(null);
      timerRef.current = null;
    }, 3200);
  }, []);

  const getToastStyle = (type) => {
    if (type === "success") {
      return {
        shell: "border-white/20 bg-neutral-900/78 text-white shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-md",
        icon: "bg-white/16 text-white",
        glyph: "lucide:check",
      };
    }
    if (type === "error") {
      return {
        shell: "border-white/20 bg-neutral-900/78 text-white shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-md",
        icon: "bg-white/16 text-white",
        glyph: "lucide:alert-circle",
      };
    }
    return {
      shell: "border-white/20 bg-neutral-900/78 text-white shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-md",
      icon: "bg-white/16 text-white",
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
            width: "min(260px, calc(100vw - 32px))",
          }}
        >
          <div className={`pointer-events-auto mx-auto w-fit min-w-[190px] max-w-full rounded-xl border px-5 py-4 flex flex-col items-center justify-center gap-2.5 text-center transition-all duration-300 ${toastStyle.shell}`}>
            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${toastStyle.icon}`}>
              <Icon 
                icon={toastStyle.glyph}
                className="text-2xl"
              ></Icon>
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold leading-snug">
                {notification.message}
              </span>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

