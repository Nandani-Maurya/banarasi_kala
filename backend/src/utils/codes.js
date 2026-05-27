const PRODUCT_PREFIX = "BKS";
const ORDER_PREFIX = "BKS";

const padNumber = (value, size) => String(Math.max(0, Number(value) || 0)).padStart(size, "0");

const formatProductCode = (id) => `${PRODUCT_PREFIX}${padNumber(id, 5)}`;

const slugifyCodePart = (value, fallback = "variant") => {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return slug || fallback;
};

const formatVariantItemCode = (productCode, colorName, colorId = null) =>
  `${productCode}-${slugifyCodePart(colorName, colorId ? `color-${colorId}` : "variant")}`;

const formatDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1, 2);
  const day = padNumber(date.getDate(), 2);
  return `${year}${month}${day}`;
};

const formatOrderNumber = (date, dailyCount) =>
  `${ORDER_PREFIX}${formatDateKey(date)}${padNumber(dailyCount, 4)}`;

module.exports = {
  formatProductCode,
  formatVariantItemCode,
  formatOrderNumber,
};
