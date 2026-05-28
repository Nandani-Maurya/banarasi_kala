export const requiredEnv = (key) => {
  const value = import.meta.env[key];
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return String(value).trim();
};

export const numberEnv = (key) => {
  const value = Number(requiredEnv(key));
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${key} must be a valid number.`);
  }
  return value;
};
