import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("checkout location retries geolocation and draws a road route", async () => {
  const checkout = await source("app/checkout/[id]/page.jsx");
  const picker = await source("components/owner/LocationPicker.jsx");
  const ownerOrders = await source("app/owner/orders/page.jsx");

  assert.match(checkout, /getGeolocationErrorMessage/);
  assert.match(checkout, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(checkout, /enableHighAccuracy: true/);
  assert.match(checkout, /maximumAge: 0/);
  assert.match(checkout, /usedFallback/);
  assert.match(checkout, /console\.warn\("Geolocation unavailable:/);
  assert.match(checkout, /const deliveryRoutePoints =/);
  assert.match(checkout, /normalizeCoordinates\(business\?\.lat, business\?\.lng\)/);
  assert.match(checkout, /routePoints=\{deliveryRoutePoints\}/);
  assert.match(checkout, /markerType="customer"/);
  assert.match(checkout, /Finding location…/);

  assert.match(picker, /roadRouteUrl/);
  assert.match(picker, /parseRoadRoutePositions/);
  assert.match(picker, /L\.polyline\(positions, ROAD_ROUTE_STYLE\)/);
  assert.match(picker, /customerLocationIcon/);
  assert.match(picker, /routeShopMarkerRef/);
  assert.match(picker, /icon: shopLocationIcon/);
  assert.match(picker, /routeLayer\.bringToBack\(\)/);
  assert.match(picker, /Keep the pin usable if the routing service is unavailable/);
  assert.match(ownerOrders, /routePoints=\{viewMapOrder\.businesses/);
});
