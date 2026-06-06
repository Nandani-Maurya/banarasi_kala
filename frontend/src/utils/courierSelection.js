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
  const parsedDate = new Date(etd);
  if (!Number.isNaN(parsedDate.getTime())) {
    const diffMs = parsedDate.getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }

  const numeric = etd.match(/\d+/)?.[0];
  if (numeric) return Number(numeric);

  return 99;
};

// Accepts both the camelCase/lowercase AND the PascalCase keys Shiprocket returns
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
    ["blocked", "disable", "disabled", "inactive", "not available", "not_serviceable"].some((word) =>
      text.includes(word),
    ),
  );
};

const isServiceableCourier = (courier = {}) => {
  if (hasFalseFlag(courier, ["is_serviceable", "serviceable", "is_enabled", "pickup_available"])) return false;
  return !isBlockedCourier(courier);
};

// Only enforces air/surface max weight when the field is explicitly present.
// min_weight in Shiprocket is a billing minimum (not a delivery restriction) so we skip it.
const supportsWeight = (courier = {}, weightKg = null) => {
  const weight = toNumber(weightKg);
  if (weight === null || weight <= 0) return true;

  const isSurface = courier.is_surface === true || courier.mode === 0;
  const maxWeightRaw = isSurface
    ? (courier.surface_max_weight ?? courier.max_weight ?? courier.max_weight_kg ?? courier.maximum_weight)
    : (courier.air_max_weight ?? courier.max_weight ?? courier.max_weight_kg ?? courier.maximum_weight);

  const maxWeight = toNumber(maxWeightRaw);
  if (maxWeight !== null && maxWeight > 0 && weight > maxWeight) return false;

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

  // Shiprocket returns these with capital letters (NDR_Reattempt, Attempt_Speed, SLA_Adherence).
  // Both variants listed so the lookup works regardless of API response casing.
  const deliveryPerformance = getScoreValue(courier, ["delivery_performance", "delivery_rating"], 0);
  const ndrReattempt       = getScoreValue(courier, ["NDR_Reattempt", "ndr_reattempt", "ndr_reattempt_count"], 0);
  const attemptSpeed       = getScoreValue(courier, ["Attempt_Speed", "attempt_speed", "pickup_performance"], 0);
  const slaAdherence       = getScoreValue(courier, ["SLA_Adherence", "sla_adherence"], 0);
  const tracking           = getScoreValue(courier, ["tracking_performance", "tracking_rating"], 0);

  const etaDays = getEtaDays(courier);
  const rate    = option.rate ?? 999999;
  const rto     = getCourierRtoCharge(courier) ?? rate;

  const preferredBoost = preferredName && normalizeText(option.courier).includes(normalizeText(preferredName)) ? 12 : 0;

  // RTO risk: a courier that reattempts well (high ndrReattempt) has lower effective RTO exposure.
  // ndrFactor runs from 1 (no reattempt) down to 0.5 (perfect reattempt score of 5).
  const ndrFactor = Math.max(0.5, 1 - ndrReattempt / 10);
  const rtoRisk   = rto * 0.05 * ndrFactor;

  return (
    preferredBoost       +
    deliveryPerformance * 5   + // reliability — top priority
    ndrReattempt        * 4   + // reattempt capability — reduces failed deliveries & RTO
    slaAdherence        * 2   + // consistent delivery date adherence
    attemptSpeed        * 2   + // fast first attempt — fewer weather/availability misses
    tracking            * 1.5 - // visibility (useful but not critical)
    etaDays             * 1.5 - // speed (less critical when delivery is free)
    rate                * 0.06- // cost to business — weighted higher since we absorb it
    rtoRisk                     // proportional RTO risk (scaled by NDR capability)
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
