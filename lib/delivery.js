import { normalizeCoordinates } from "@/lib/coordinates";

export const DELIVERY_ROUNDING_RULES = [
  { value: "CEIL", label: "Round up to the next whole kilometer" },
  { value: "ROUND", label: "Round to the nearest whole kilometer" },
  { value: "FLOOR", label: "Round down to the whole kilometer" },
];

export const DEFAULT_DELIVERY_SETTINGS = Object.freeze({
  delivery_enabled: true,
  delivery_base_fee: 30,
  delivery_included_distance_km: 3,
  delivery_fee_per_extra_km: 10,
  delivery_max_distance_km: null,
  delivery_distance_rounding: "CEIL",
});

const isBlank = (value) => value === null || value === undefined || value === "";

function finiteAmount(value, fallback = null) {
  if (isBlank(value)) return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}

export function normalizeDeliverySettings(source = {}) {
  const maxDistance = finiteAmount(source.delivery_max_distance_km, DEFAULT_DELIVERY_SETTINGS.delivery_max_distance_km);
  const rounding = DELIVERY_ROUNDING_RULES.some((rule) => rule.value === source.delivery_distance_rounding)
    ? source.delivery_distance_rounding
    : DEFAULT_DELIVERY_SETTINGS.delivery_distance_rounding;

  return {
    delivery_enabled: source.delivery_enabled !== false,
    delivery_base_fee: Math.max(0, finiteAmount(source.delivery_base_fee, DEFAULT_DELIVERY_SETTINGS.delivery_base_fee)),
    delivery_included_distance_km: Math.max(0.01, finiteAmount(source.delivery_included_distance_km, DEFAULT_DELIVERY_SETTINGS.delivery_included_distance_km)),
    delivery_fee_per_extra_km: Math.max(0, finiteAmount(source.delivery_fee_per_extra_km, DEFAULT_DELIVERY_SETTINGS.delivery_fee_per_extra_km)),
    delivery_max_distance_km: maxDistance === null ? null : Math.max(0, maxDistance),
    delivery_distance_rounding: rounding,
  };
}

export function validateDeliverySettings(source = {}) {
  const errors = {};
  const baseFee = finiteAmount(source.delivery_base_fee);
  const includedDistance = finiteAmount(source.delivery_included_distance_km);
  const feePerExtraKm = finiteAmount(source.delivery_fee_per_extra_km);
  const maxDistance = finiteAmount(source.delivery_max_distance_km);
  const hasMaxDistanceInput = !isBlank(source.delivery_max_distance_km);
  const rounding = source.delivery_distance_rounding;

  if (baseFee === null || baseFee < 0) errors.delivery_base_fee = "Enter a fee of ₱0.00 or more.";
  if (includedDistance === null || includedDistance <= 0) errors.delivery_included_distance_km = "Included distance must be greater than 0 km.";
  if (feePerExtraKm === null || feePerExtraKm < 0) errors.delivery_fee_per_extra_km = "Enter a fee of ₱0.00 or more.";
  if (hasMaxDistanceInput && maxDistance === null) errors.delivery_max_distance_km = "Enter a valid maximum distance or leave it blank.";
  if (maxDistance !== null && maxDistance < 0) errors.delivery_max_distance_km = "Maximum distance cannot be negative.";
  if (maxDistance !== null && includedDistance !== null && maxDistance < includedDistance) {
    errors.delivery_max_distance_km = "Maximum distance cannot be smaller than the included distance.";
  }
  if (!DELIVERY_ROUNDING_RULES.some((rule) => rule.value === rounding)) {
    errors.delivery_distance_rounding = "Choose a valid distance rounding rule.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: {
      delivery_enabled: source.delivery_enabled !== false,
      delivery_base_fee: baseFee,
      delivery_included_distance_km: includedDistance,
      delivery_fee_per_extra_km: feePerExtraKm,
      delivery_max_distance_km: maxDistance,
      delivery_distance_rounding: rounding,
    },
  };
}

export function calculateDistanceKm(shopCoordinates, customerCoordinates) {
  const shop = normalizeCoordinates(shopCoordinates?.lat, shopCoordinates?.lng);
  const customer = normalizeCoordinates(customerCoordinates?.lat, customerCoordinates?.lng);
  if (!shop || !customer) return null;

  const earthRadiusKm = 6371;
  const latitudeDelta = (customer.lat - shop.lat) * Math.PI / 180;
  const longitudeDelta = (customer.lng - shop.lng) * Math.PI / 180;
  const shopLatitude = shop.lat * Math.PI / 180;
  const customerLatitude = customer.lat * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(shopLatitude) * Math.cos(customerLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function roundExtraDistanceKm(distanceKm, roundingRule = "CEIL") {
  if (!Number.isFinite(Number(distanceKm))) return 0;
  const distance = Math.max(0, Number(distanceKm));
  if (roundingRule === "FLOOR") return Math.floor(distance);
  if (roundingRule === "ROUND") return Math.round(distance);
  return Math.ceil(distance);
}

export function calculateDeliveryFeeFromDistance(distanceKm, source = {}) {
  const settings = normalizeDeliverySettings(source);
  const numericDistance = Number(distanceKm);
  if (!Number.isFinite(numericDistance) || numericDistance < 0) {
    return { status: "MISSING_CUSTOMER_COORDINATES", eligible: false, deliveryFee: null };
  }

  if (settings.delivery_max_distance_km !== null && numericDistance > settings.delivery_max_distance_km) {
    return {
      status: "OUT_OF_RANGE",
      eligible: false,
      distanceKm: numericDistance,
      extraDistanceKm: null,
      baseFee: settings.delivery_base_fee,
      extraFee: null,
      deliveryFee: null,
    };
  }

  const extraDistanceKm = roundExtraDistanceKm(numericDistance - settings.delivery_included_distance_km, settings.delivery_distance_rounding);
  const extraFee = extraDistanceKm * settings.delivery_fee_per_extra_km;
  return {
    status: "AVAILABLE",
    eligible: true,
    distanceKm: numericDistance,
    extraDistanceKm,
    baseFee: settings.delivery_base_fee,
    extraFee,
    deliveryFee: settings.delivery_base_fee + extraFee,
  };
}

export function calculateDeliveryFee({ shopCoordinates, customerCoordinates, settings = {} }) {
  const normalizedSettings = normalizeDeliverySettings(settings);
  if (!normalizedSettings.delivery_enabled) {
    return { status: "DISABLED", eligible: false, deliveryFee: null };
  }

  if (!normalizeCoordinates(shopCoordinates?.lat, shopCoordinates?.lng)) {
    return { status: "MISSING_SHOP_COORDINATES", eligible: false, deliveryFee: null };
  }
  if (!normalizeCoordinates(customerCoordinates?.lat, customerCoordinates?.lng)) {
    return { status: "MISSING_CUSTOMER_COORDINATES", eligible: false, deliveryFee: null };
  }

  return calculateDeliveryFeeFromDistance(
    calculateDistanceKm(shopCoordinates, customerCoordinates),
    normalizedSettings
  );
}

export function formatDeliveryDistance(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance)) return "Unavailable";
  return `${distance.toFixed(2)} km`;
}
