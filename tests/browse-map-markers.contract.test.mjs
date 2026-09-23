import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("browse map uses a person marker for the customer and pins for shops", async () => {
  const map = await source("components/MapComponent.jsx");
  const browse = await source("app/browse/page.jsx");

  assert.match(map, /createShopPinIcon/);
  assert.match(map, /border-radius: 50% 50% 50% 0/);
  assert.match(map, /createUserLocationIcon/);
  assert.match(map, /aria-label="Your location"/);
  assert.match(map, /<svg width="23" height="23"/);
  assert.match(map, /<circle cx="12" cy="7\.5"/);
  assert.match(map, /<path d="M4 20a8 8 0 0 1 16 0H4Z"/);
  assert.match(map, /title="Your location"/);
  assert.match(map, /title=\{`Printing shop: \$\{b\.name\}`\}/);
  assert.match(map, /aria-label="Map legend"/);
  assert.match(map, /> Your location</);
  assert.match(map, /> Printing shop</);
  assert.match(map, /safeUserLocation && \(/);
  assert.doesNotMatch(map, /LocateFixed/);
  assert.doesNotMatch(browse, /LocateFixed/);
  assert.match(browse, /Search printing shops or an area/);
  assert.match(browse, /placeholder="Search printing shops or area\.\.\."/);
});

test("browse location permission states never create a fake customer marker", async () => {
  const browse = await source("app/browse/page.jsx");
  const map = await source("components/MapComponent.jsx");

  assert.match(browse, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(browse, /error\?\.code === 1 \? "denied"/);
  assert.match(browse, /error\?\.code === 3 \? "timeout"/);
  assert.match(browse, /LOCATION_STATUS_MESSAGES/);
  assert.match(browse, /Location access was denied/);
  assert.match(browse, /Your location is unavailable/);
  assert.match(browse, /normalizeCoordinates\(pos\.coords\.latitude, pos\.coords\.longitude\)/);
  assert.match(map, /normalizeCoordinates\(userLocation\?\.lat, userLocation\?\.lng\)/);
  assert.match(map, /safeUserLocation && \(/);
  assert.match(map, /routePoints = useMemo\(/);
  assert.match(map, /safeUserLocation && routeTarget/);
  assert.match(map, /safeUserLocation\.lat, safeUserLocation\.lng/);
});
