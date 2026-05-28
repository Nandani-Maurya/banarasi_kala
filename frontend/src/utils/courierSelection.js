import { requiredEnv } from "./env";

const toNumber = (value, fallback = null) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const getCourierRate = (courier = {}) => {
  const rate = toNumber(courier.rate ?? courier.freight_charge ?? courier.courier_charge);
  return rate !== null && rate >= 0 ? rate : null;
};

const getCourierRtoCharge = (courier = {}) => {
  const rate = toNumber(courier.rto_charges ?? courier.rto_charge ?? courier.rto_freight_charge);
  return rate !== null && rate >= 0 ? rate : null;
};

const getEtaDays = (courier = {}) => {
  const directDays = toNumber(courier.estimated_delivery_days ?? courier.etd_days ?? courier.sla_days);
  if (directDays !== null) return directDays;

  const etd = String(courier.etd || courier.edd || "").trim();
  const numeric = etd.match(/\d+/)?.[0];
  if (numeric) return Number(numeric);

  const parsedDate = new Date(etd);
  if (!Number.isNaN(parsedDate.getTime())) {
    const diffMs = parsedDate.getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }

  return 99;
};

const getScoreValue = (courier = {}, keys = [], fallback = 0) => {
  for (const key of keys) {
    const value = toNumber(courier[key]);
    if (value !== null) return value;
  }
  return fallback;
};

const hasFalseFlag = (courier = {}, keys = []) =>
  keys.some((key) => {
    if (!(key in courier)) return false;
    const value = courier[key];
    return value === false || value === 0 || value === "0" || normalizeText(value) === "false";
  });

const isBlockedCourier = (courier = {}) => {
  const blockedText = [
    courier.blocked,
    courier.is_blocked,
    courier.is_disabled,
    courier.status,
    courier.blocked_reason,
    courier.remarks,
  ].map(normalizeText);

  return blockedText.some((text) =>
    ["blocked", "disable", "disabled", "inactive", "not available", "not_serviceable"].some((word) => text.includes(word)),
  );
};

const isServiceableCourier = (courier = {}) => {
  if (hasFalseFlag(courier, ["is_serviceable", "serviceable", "is_enabled", "pickup_available"])) return false;
  return !isBlockedCourier(courier);
};

const supportsWeight = (courier = {}, weightKg = null) => {
  const weight = toNumber(weightKg);
  if (weight === null || weight <= 0) return true;

  const minWeight = toNumber(courier.min_weight ?? courier.min_weight_kg ?? courier.minimum_weight);
  const maxWeight = toNumber(courier.max_weight ?? courier.max_weight_kg ?? courier.maximum_weight);
  if (minWeight !== null && weight < minWeight) return false;
  if (maxWeight !== null && weight > maxWeight) return false;
  return true;
};

const supportsCod = (courier = {}, requireCod = false) => {
  if (!requireCod) return true;
  const cod = courier.cod ?? courier.is_cod ?? courier.cod_available ?? courier.cod_supported;
  if (cod === undefined || cod === null || cod === "") return true;
  return cod === true || cod === 1 || cod === "1" || normalizeText(cod) === "yes" || normalizeText(cod) === "true";
};

const scoreCourier = (option, preferredName = "") => {
  const courier = option.raw || {};
  const deliveryPerformance = getScoreValue(courier, ["delivery_performance", "delivery_rating", "rating"], 0);
  const ndrReattempt = getScoreValue(courier, ["ndr_reattempt", "ndr_reattempt_count", "reattempt", "call_before_delivery"], 0);
  const tracking = getScoreValue(courier, ["tracking_performance", "tracking_rating", "tracking"], 0);
  const attemptSpeed = getScoreValue(courier, ["attempt_speed", "pickup_performance", "pickup_rating"], 0);
  const etaDays = getEtaDays(courier);
  const rate = option.rate ?? 999999;
  const rto = getCourierRtoCharge(courier) ?? rate;
  const preferredBoost = preferredName && normalizeText(option.courier).includes(normalizeText(preferredName)) ? 12 : 0;
  const rtoPenalty = ndrReattempt > 0 ? 0 : rto * 0.03;

  return (
    preferredBoost +
    deliveryPerformance * 4 +
    ndrReattempt * 2.5 +
    tracking * 2 +
    attemptSpeed * 1.5 -
    etaDays * 2 -
    rate * 0.04 -
    rtoPenalty
  );
};

export const selectBestCourier = (couriers = [], {
  preferredName = requiredEnv("VITE_PREFERRED_COURIER_NAME"),
  weightKg = null,
  requireCod = false,
} = {}) => {
  const options = couriers
    .map((courier) => ({
      rate: getCourierRate(courier),
      etd: courier?.etd || courier?.estimated_delivery_days || null,
      courier: courier?.courier_name || courier?.name || "Courier",
      raw: courier,
    }))
    .filter((option) =>
      option.rate !== null &&
      isServiceableCourier(option.raw) &&
      supportsWeight(option.raw, weightKg) &&
      supportsCod(option.raw, requireCod),
    )
    .map((option) => ({ ...option, score: scoreCourier(option, preferredName) }))
    .sort((left, right) =>
      right.score - left.score ||
      getEtaDays(left.raw) - getEtaDays(right.raw) ||
      left.rate - right.rate ||
      (getCourierRtoCharge(left.raw) ?? left.rate) - (getCourierRtoCharge(right.raw) ?? right.rate),
    );

  return options[0] || null;
};
