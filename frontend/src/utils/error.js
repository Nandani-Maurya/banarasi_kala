const TECHNICAL_PATTERNS = [
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /syntax error/i,
  /sequelize/i,
  /database/i,
  /internal server error/i,
  /network error/i,
  /failed to fetch/i,
  /not allowed by cors/i,
  /econnrefused/i,
  /timeout/i,
  /stack/i,
];

export const isTechnicalErrorMessage = (message) =>
  TECHNICAL_PATTERNS.some((pattern) => pattern.test(String(message || "")));

export const getApiErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const serverMessage = error?.response?.data?.message || error?.data?.message;
  const plainMessage = error?.message;
  const message = serverMessage || plainMessage || fallback;
  return isTechnicalErrorMessage(message) ? fallback : message;
};

export const unwrapApiData = (payload) => {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
    return payload.data;
  }
  return payload;
};
