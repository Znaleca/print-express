import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin navigation exposes pending review-removal requests", async () => {
  const sidebar = await source("components/admin/AdminSidebar.jsx");
  const counts = await source("app/api/admin/counts/route.js");
  const page = await source("app/admin/reviews/page.jsx");

  assert.match(sidebar, /href: "\/admin\/reviews"/);
  assert.match(sidebar, /countKey: "reviewRemovals"/);
  assert.match(counts, /review_moderation_requests/);
  assert.match(counts, /reviewRemovals/);
  assert.match(page, /first\.status === "PENDING"/);
  assert.match(sidebar, /review_moderation_requests/);
});

test("customers have purchase history and can review every purchased item", async () => {
  const route = await source("app/api/customer/reviews/route.js");
  const page = await source("app/reviews/page.jsx");
  const navbar = await source("components/Navbar.jsx");
  const migration = await source("supabase/migrations/20260916130000_order_item_reviews.sql");

  assert.match(route, /CUSTOMER/);
  assert.match(route, /COMPLETED_STATUSES/);
  assert.match(route, /This item was not part of the order/);
  assert.match(route, /order_item_reviews/);
  assert.match(page, /Purchases &amp; Reviews/);
  assert.match(page, /rate each product or service separately/i);
  assert.match(page, /order\.items\.map/);
  assert.match(navbar, /href="\/reviews"/);
  assert.match(migration, /unique \(order_id, service_id\)/);
  assert.match(migration, /request_item_review_removal/);
});

test("item reviews feed public and owner rating surfaces", async () => {
  const business = await source("app/business/[id]/page.jsx");
  const browse = await source("app/browse/page.jsx");
  const shops = await source("app/shops/page.jsx");
  const ownerRoute = await source("app/api/owner/reviews/route.js");

  for (const page of [business, browse, shops]) assert.match(page, /visible_order_item_reviews/);
  assert.match(ownerRoute, /request_item_review_removal/);
  assert.match(ownerRoute, /review_id/);
});
