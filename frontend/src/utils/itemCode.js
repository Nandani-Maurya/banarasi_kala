const slugifyCodePart = (value, fallback = "variant") => {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return slug || fallback;
};

export const getVariantItemCode = (productCode, colorName, colorId = null) => {
  if (!productCode) return "";
  return `${productCode}-${slugifyCodePart(colorName, colorId ? `color-${colorId}` : "variant")}`;
};

export const getVariantSku = (product = {}, colorId = null, colorName = "") =>
  product?.variant_skus?.[String(colorId)] || getVariantItemCode(product?.sku, colorName, colorId);

export const getOrderDisplayNumber = (order) => order?.order_number || `BKS${String(order?.id || "").padStart(4, "0")}`;
