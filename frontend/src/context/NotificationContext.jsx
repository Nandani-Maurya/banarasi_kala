import { createContext, useContext, useCallback } from 'react';
import toast from 'react-hot-toast';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const showNotification = useCallback((message, type = 'success') => {
    const text = typeof message === 'object' && message !== null ? message.message : message;
    const resolvedType = typeof message === 'object' && message !== null ? (message.type || type) : type;

    if (resolvedType === 'success') {
      toast.success(text);
    } else if (resolvedType === 'error') {
      toast.error(text);
    } else {
      toast(text);
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};
