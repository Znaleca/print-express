import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("owner reviews use the authenticated owner's exact business and server-side moderation", async () => {
  const route = await source("app/api/owner/reviews/route.js");
  const page = await source("app/owner/reviews/page.jsx");
  const tracking = await source("app/track/page.jsx");

  assert.match(route, /requireAuthenticatedUser\(request\)/);
  assert.match(route, /auth\.profile\.role !== "BUSINESS_OWNER"/);
  assert.match(route, /\.eq\("owner_id", ownerId\)/);
  assert.match(route, /\.eq\("business_id", business\.id\)/);
  assert.match(route, /\.in\("status", COMPLETED_STATUSES\)/);
  assert.match(route, /\.not\("rating", "is", null\)/);
  assert.match(route, /averageRating/);
  assert.match(route, /hiddenReviews/);
  assert.match(route, /export async function POST/);
  assert.match(route, /request_review_removal/);
  assert.match(route, /feedback_masked/);
  assert.doesNotMatch(route, /feedback_hidden_by: hidden \? "owner"/);
  assert.doesNotMatch(route, /console\.error\([^)]*email/i);

  assert.match(page, /api\/owner\/reviews/);
  assert.match(page, /cache: "no-store"/);
  assert.match(page, /table: "orders"/);
  assert.match(page, /business_id=eq\.\$\{payload\.business\.id\}/);
  assert.match(page, /Request review removal/);
  assert.match(page, /Pending Admin review/);
  assert.match(page, /Retry/);
  assert.match(page, /disabled=\{actionLoading === review\.order_id\}/);
  assert.doesNotMatch(page, /from\("business_reviews"\)/);

  // The order row is the source of truth; the view must never be written to.
  assert.doesNotMatch(tracking, /from\("business_reviews"\)\s*\n\s*\.upsert/);
});

test("review visibility and public reads are protected by the canonical migration", async () => {
  const migration = await source("supabase/migrations/20260913170000_review_consistency_and_map_guards.sql");
  const business = await source("app/business/[id]/page.jsx");
  const browse = await source("app/browse/page.jsx");
  const shops = await source("app/shops/page.jsx");

  assert.match(migration, /add column if not exists feedback_hidden/);
  assert.match(migration, /create view public\.business_reviews/);
  assert.match(migration, /create view public\.visible_business_reviews/);
  assert.match(migration, /where feedback_hidden = false/);
  assert.match(migration, /revoke all on public\.business_reviews from anon, authenticated/);
  assert.match(migration, /grant select on public\.visible_business_reviews to anon, authenticated/);
  assert.match(migration, /'feedback_hidden', 'feedback_hidden_at', 'feedback_hidden_by'/);
  assert.match(migration, /Owners cannot change protected order fields/);

  for (const page of [business, browse, shops]) {
    assert.match(page, /from\("visible_business_reviews"\)/);
    assert.doesNotMatch(page, /from\("business_reviews"\)/);
  }
  assert.match(business, /public_business_reviews_/);
  assert.match(browse, /table: "orders"/);
  assert.match(shops, /table: "orders"/);
});

test("all map consumers normalize coordinates and keep Leaflet client-only", async () => {
  const coordinates = await source("lib/coordinates.js");
  const map = await source("components/MapComponent.jsx");
  const roadRoute = await source("components/RoadRoute.jsx");
  const roadRouteHelper = await source("lib/roadRoute.js");
  const picker = await source("components/owner/LocationPicker.jsx");
  const browse = await source("app/browse/page.jsx");
  const checkout = await source("app/checkout/[id]/page.jsx");
  const ownerShop = await source("app/owner/shop/page.jsx");

  assert.match(coordinates, /normalizedLat < -90 \|\| normalizedLat > 90/);
  assert.match(coordinates, /normalizedLng < -180 \|\| normalizedLng > 180/);
  assert.match(map, /normalizeCoordinates\(business\?\.lat, business\?\.lng\)/);
  assert.match(map, /ResizeObserver/);
  assert.match(map, /clearTimeout\(moveTimer\)/);
  assert.match(map, /RoadRoute/);
  assert.doesNotMatch(map, /<Polyline/);
  assert.match(roadRoute, /AbortController/);
  assert.match(roadRoute, /fitBounds\(nextPositions/);
  assert.match(roadRouteHelper, /router\.project-osrm\.org/);
  assert.match(roadRouteHelper, /geometries=geojson/);
  assert.match(roadRouteHelper, /parseRoadRoutePositions/);
  assert.match(map, /No verified shop locations are available yet/);
  assert.match(picker, /normalizeCoordinates/);
  assert.match(picker, /markerRef\.current\?\.remove\(\)/);
  assert.match(picker, /resizeObserver\?\.disconnect\(\)/);
  assert.match(picker, /draggable: !readOnly/);
  assert.match(picker, /if \(!nextPosition\) return null;/);
  assert.match(browse, /ssr: false/);
  assert.match(browse, /normalizeCoordinates\(pos\.coords\.latitude, pos\.coords\.longitude\)/);
  assert.match(checkout, /Pin your delivery location on the map before placing your order/);
  assert.match(checkout, /delivery_coordinates:/);
  assert.match(ownerShop, /normalizeCoordinates\(form\.lat, form\.lng\)/);
  assert.match(ownerShop, /nominatim\.openstreetmap\.org\/reverse/);
  assert.match(ownerShop, /Address and map pin are synchronized\. You can still edit the address\./);
  assert.match(ownerShop, /addressEditVersionRef\.current \+= 1/);
  assert.match(ownerShop, /addressLookupControllerRef\.current\?\.abort\(\)/);
});
