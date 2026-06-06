const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const getProductStockInfo = (product = {}, colorId = null) => {
  const item = product || {};
  const threshold = Math.max(1, toNumber(item.low_stock_threshold, 5));
  const status = item.status || "active";
  const colorStock =
    colorId !== null && colorId !== undefined
      ? item.color_stocks?.[colorId] ?? item.color_stocks?.[String(colorId)]
      : undefined;
  const quantity = toNumber(colorStock ?? item.stock_quantity, 0);
  const isInactive = status !== "active";
  const isOutOfStock = isInactive || quantity <= 0;
  const isLowStock = !isOutOfStock && quantity < threshold;

  const isVeryLowStock = isLowStock && quantity <= 2;

  return {
    quantity,
    threshold,
    isInactive,
    isOutOfStock,
    isLowStock,
    status: isOutOfStock ? "out_of_stock" : isLowStock ? "low_stock" : "in_stock",
    badge: isOutOfStock ? "Out of stock"
      : isVeryLowStock ? `Only ${quantity} left`
      : isLowStock ? "Few items left"
      : "",
    colorMessage: isOutOfStock
      ? "This color is out of stock"
      : isVeryLowStock
        ? `Only ${quantity} left in this color`
      : isLowStock
        ? "Few items left in this color"
        : "",
  };
};

export const canAddProductToBag = (product = {}, colorId = null, quantity = 1) => {
  const stock = getProductStockInfo(product, colorId);
  return !stock.isOutOfStock && toNumber(quantity, 1) <= stock.quantity;
};
