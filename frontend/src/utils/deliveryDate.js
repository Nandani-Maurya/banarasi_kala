import { numberEnv } from "./env";

const ORDER_PROCESSING_DAYS = numberEnv("VITE_ORDER_PROCESSING_DAYS");

export const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

export const formatEstimatedDeliveryDate = (date) =>
  date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const getShiprocketEtaDate = (eta) => {
  if (!eta) return null;
  const numericDays = String(eta).match(/\d+/)?.[0];
  const parsedDate = new Date(eta);
  if (!Number.isNaN(parsedDate.getTime())) return parsedDate;
  if (numericDays) return addDays(new Date(), Number(numericDays));
  return null;
};

export const getEstimatedDeliveryDate = (eta) => {
  const shiprocketDate = getShiprocketEtaDate(eta);
  return addDays(shiprocketDate || new Date(), ORDER_PROCESSING_DAYS);
};
