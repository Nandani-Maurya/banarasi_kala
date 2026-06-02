import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';

const api = axios.create({
  baseURL: API_ENDPOINTS.base,
});

const AUTH_STORAGE_KEYS = ["user", "customer", "accessToken", "refreshToken"];

const clearStoredAuth = () => {
  AUTH_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

// Request interceptor for API calls
api.interceptors.request.use(
  async config => {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor for API calls
api.interceptors.response.use(
  response => {
    return response;
  },
  async error => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
      
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_ENDPOINTS.auth}/refresh-token`, { token: refreshToken });
          if (res.status === 200) {
            const { accessToken, refreshToken: nextRefreshToken } = res.data;
            const keepLoggedIn = !!localStorage.getItem('refreshToken');
            const storage = keepLoggedIn ? localStorage : sessionStorage;
            
            storage.setItem('accessToken', accessToken);
            if (nextRefreshToken) storage.setItem('refreshToken', nextRefreshToken);
            api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
            axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
            return api(originalRequest);
          }
        } catch {
          // Refresh token expired or invalid
          clearStoredAuth();
          window.location.href = "/login?refresh=session";
        }
      } else {
        window.location.href = "/login?refresh=session";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
