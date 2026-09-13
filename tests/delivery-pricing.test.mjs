import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function loadDelivery() {
  const coordinates = await source("lib/coordinates.js");
  const delivery = await source("lib/delivery.js");
  return import(`data:text/javascript,${encodeURIComponent(`${coordinates}\n${delivery.replace('import { normalizeCoordinates } from "@/lib/coordinates";\n', "")}`)}`);
}

test("delivery pricing uses the configured radius, rounding, and maximum range", async () => {
  const {
    calculateDeliveryFee,
    calculateDeliveryFeeFromDistance,
    DEFAULT_DELIVERY_SETTINGS,
    formatDeliveryDistance,
    validateDeliverySettings,
  } = await loadDelivery();

  const settings = DEFAULT_DELIVERY_SETTINGS;
  assert.equal(calculateDeliveryFeeFromDistance(2.5, settings).deliveryFee, 30);
  assert.equal(calculateDeliveryFeeFromDistance(5.2, settings).extraDistanceKm, 3);
  assert.equal(calculateDeliveryFeeFromDistance(5.2, settings).deliveryFee, 60);
  assert.equal(calculateDeliveryFeeFromDistance(4.01, { ...settings, delivery_distance_rounding: "ROUND" }).extraDistanceKm, 1);
  assert.equal(calculateDeliveryFeeFromDistance(4.01, { ...settings, delivery_distance_rounding: "FLOOR" }).extraDistanceKm, 1);
  assert.equal(calculateDeliveryFeeFromDistance(6.1, { ...settings, delivery_max_distance_km: 6 }).status, "OUT_OF_RANGE");
  assert.equal(calculateDeliveryFee({ shopCoordinates: null, customerCoordinates: { lat: 14.68, lng: 120.53 }, settings }).status, "MISSING_SHOP_COORDINATES");
  assert.equal(calculateDeliveryFee({ shopCoordinates: { lat: 14.68, lng: 120.53 }, customerCoordinates: null, settings }).status, "MISSING_CUSTOMER_COORDINATES");
  assert.equal(calculateDeliveryFee({ shopCoordinates: { lat: 14.68, lng: 120.53 }, customerCoordinates: { lat: 14.68, lng: 120.53 }, settings: { ...settings, delivery_enabled: false } }).status, "DISABLED");
  assert.equal(formatDeliveryDistance(2.5), "2.50 km");
  assert.equal(validateDeliverySettings({ ...settings, delivery_max_distance_km: 2 }).valid, false);
  assert.equal(validateDeliverySettings({ ...settings, delivery_max_distance_km: "not-a-number" }).valid, false);
});

test("delivery settings and checkout keep fee calculation server-authoritative", async () => {
  const ownerShop = await source("app/owner/shop/page.jsx");
  const checkout = await source("app/checkout/[id]/page.jsx");
  const orderSummary = await source("components/checkout/OrderSummary.jsx");
  const locationPicker = await source("components/owner/LocationPicker.jsx");
  const migration = await source("supabase/migrations/20260913190000_delivery_pricing_and_server_fee.sql");
  const sms = await source("app/api/orders/status-sms/route.js");
  const receipt = await source("components/ReceiptModal.jsx");
  const tracking = await source("app/track/page.jsx");

  assert.match(ownerShop, /Delivery pricing/);
  assert.match(ownerShop, /delivery_base_fee/);
  assert.match(ownerShop, /delivery_included_distance_km/);
  assert.match(ownerShop, /delivery_max_distance_km/);
  assert.equal((ownerShop.match(/<LocationPicker/g) || []).length, 1, "owner shop should render one shared location map");
  assert.match(ownerShop, /includedRadiusKm={form\.delivery_enabled/);
  assert.match(ownerShop, /Delivery area uses the shop map/);
  assert.match(ownerShop, /Delivery available/);
  assert.match(ownerShop, /Delivery costs/);
  assert.match(locationPicker, /L\.circle/);
  assert.match(locationPicker, /includedRadiusKm/);
  assert.match(locationPicker, /maxRadiusKm/);
  assert.match(checkout, /calculateDeliveryFee/);
  assert.match(checkout, /deliveryQuote\.eligible/);
  assert.match(checkout, /This address is outside the shop’s delivery area/);
  assert.match(checkout, /deliveryFee={deliveryFee}/);
  assert.match(orderSummary, /Delivery fee/);
  assert.match(orderSummary, /Confirm location/);
  assert.match(migration, /add column if not exists delivery_fee/);
  assert.match(migration, /calculate_delivery_fee_for_order/);
  assert.match(migration, /new\.delivery_fee := calculation\.total_fee/);
  assert.match(migration, /before insert on public\.orders/);
  assert.match(migration, /delivery_max_distance_km/);
  assert.match(migration, /This address is outside the shop''s delivery area/);
  assert.match(sms, /downpayment_amount, balance_amount/);
  assert.match(receipt, /DELIVERY FEE/);
  assert.match(tracking, /Delivery Fee/);
});
