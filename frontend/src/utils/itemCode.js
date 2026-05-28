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

// Reads variant_skus set by backend on product create/update
export const getVariantSku = (product = {}, colorId = null, colorName = "") =>
  product?.variant_skus?.[String(colorId)] || getVariantItemCode(product?.sku, colorName, colorId);

// Always prefer backend-generated order_number; fallback mirrors backend format
export const getOrderDisplayNumber = (order) => {
  if (order?.order_number) return order.order_number;
  if (!order?.id) return "";
  const d = order.createdAt || order.created_at ? new Date(order.createdAt || order.created_at) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `BKS${year}${month}${day}${order.id}`;
};

