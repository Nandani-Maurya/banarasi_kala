export const requiredEnv = (key) => {
  const value = import.meta.env[key];
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return String(value).trim();
};
