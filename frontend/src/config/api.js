import { requiredEnv } from "../utils/env";

const API_BASE_URL = requiredEnv("VITE_API_URL");

export const API_ENDPOINTS = {
  base: API_BASE_URL,
  products: `${API_BASE_URL}/api/products`,
  colors: `${API_BASE_URL}/api/colors`,
  materials: `${API_BASE_URL}/api/materials`,
  occasions: `${API_BASE_URL}/api/occasions`,
  varieties: `${API_BASE_URL}/api/varieties`,
  orders: `${API_BASE_URL}/api/orders`,
  coupons: `${API_BASE_URL}/api/coupons`,
  auth: `${API_BASE_URL}/api/auth`,
  cart: `${API_BASE_URL}/api/cart`,
  cartValidate: `${API_BASE_URL}/api/cart/validate`,
  wishlist: `${API_BASE_URL}/api/wishlist`,
  feedback: `${API_BASE_URL}/api/feedback`,
  feedbackSubmit: `${API_BASE_URL}/api/feedback/submit`,
  feedbackGeneral: `${API_BASE_URL}/api/feedback/general`,
  myOrders: `${API_BASE_URL}/api/orders/my`,
  trackOrder: (orderId) => `${API_BASE_URL}/api/orders/track/${orderId}`,
  cancelOrder: (orderId) => `${API_BASE_URL}/api/orders/${orderId}/cancel`,
  shiprocket: `${API_BASE_URL}/api/shiprocket`,
  createReturn: `${API_BASE_URL}/api/shiprocket/create-return`,
  contactSubmit: `${API_BASE_URL}/api/contact/submit`,
  razorpay: {
    createOrder: `${API_BASE_URL}/api/razorpay/create-order`,
    verifyPayment: `${API_BASE_URL}/api/razorpay/verify-payment`,
  },
};

export default API_ENDPOINTS;
