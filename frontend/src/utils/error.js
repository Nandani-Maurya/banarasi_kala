export const getApiErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const serverMessage = error?.response?.data?.message || error?.data?.message;
  const plainMessage = error?.message;
  return serverMessage || plainMessage || fallback;
};

export const unwrapApiData = (payload) => {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
    return payload.data;
  }
  return payload;
};
