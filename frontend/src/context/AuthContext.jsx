import { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';
import { getApiErrorMessage } from '../utils/error';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const AUTH_STORAGE_KEYS = ["user", "customer", "accessToken", "refreshToken"];

const clearStoredAuth = () => {
  AUTH_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser =
      localStorage.getItem('customer') ||
      sessionStorage.getItem('customer') ||
      localStorage.getItem('user') ||
      sessionStorage.getItem('user');
    const token =
      localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch {
        clearStoredAuth();
      }
    }
    setLoading(false);
  }, []);

  const persistAuth = ({ customer, accessToken, refreshToken, keepLoggedIn = true }) => {
    clearStoredAuth();
    setUser(customer);

    const storage = keepLoggedIn ? localStorage : sessionStorage;
    storage.setItem('customer', JSON.stringify(customer));
    storage.setItem('accessToken', accessToken);
    storage.setItem('refreshToken', refreshToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  };

  const login = async (identifier, password, keepLoggedIn) => {
    try {
      const response = await axios.post(`${API_ENDPOINTS.auth}/login`, { identifier, password });
      const customer = response.data.customer || response.data.user;
      const { accessToken, refreshToken } = response.data;

      persistAuth({ customer, accessToken, refreshToken, keepLoggedIn });
      
      return customer;
    } catch (error) {
      const data = error.response?.data;
      const err = new Error(getApiErrorMessage(error, "Login failed"));
      err.code = data?.code;
      err.phone = data?.phone;
      err.status = error.response?.status;
      console.error("[AuthContext:login]", {
        status: err.status,
        code: err.code,
        message: err.message,
      });
      throw err;
    }
  };

  const signup = async (userData) => {
    try {
      const response = await axios.post(`${API_ENDPOINTS.auth}/register`, userData);
      const customer = response.data.customer || response.data.user;
      const { accessToken, refreshToken } = response.data;

      persistAuth({ customer, accessToken, refreshToken, keepLoggedIn: true });
      
      return customer;
    } catch (error) {
      const data = error.response?.data;
      const err = new Error(getApiErrorMessage(error, "Signup failed"));
      err.code = data?.code;
      err.status = error.response?.status;
      err.details = data;
      console.error("[AuthContext:signup]", {
        status: err.status,
        code: err.code,
        message: err.message,
      });
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
    clearStoredAuth();
    delete axios.defaults.headers.common['Authorization'];
  };

  const updateUser = (updatedCustomer) => {
    setUser(updatedCustomer);
    const storage = localStorage.getItem('customer') ? localStorage : sessionStorage;
    storage.setItem('customer', JSON.stringify(updatedCustomer));
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
