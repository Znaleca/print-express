import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("owner dashboard is scoped, bounded, range-aware, and sanitized", () => {
  const route = read("app/api/owner/dashboard/route.js");

  assert.match(route, /requireAuthenticatedUser/);
  assert.match(route, /auth\.profile\.role !== "BUSINESS_OWNER"/);
  assert.match(route, /eq\("owner_id", auth\.user\.id\)/);
  assert.match(route, /eq\("business_id", business\.id\)/);
  assert.match(route, /normalizeRange/);
  assert.match(route, /normalizeSalesPeriod/);
  assert.match(route, /salesPeriod/);
  assert.match(route, /MAX_ORDER_ROWS/);
  assert.match(route, /MAX_MESSAGE_ROWS/);
  assert.match(route, /unreadResult/);
  assert.match(route, /OWNER_DASHBOARD_UNAVAILABLE/);
  assert.match(route, /recentMessages/);
  assert.match(route, /recentReviews/);
  assert.match(route, /upcomingMeetingList/);
  assert.match(route, /weeklySales/);
  assert.match(route, /salesTrend/);
  assert.match(route, /topProducts/);
  assert.doesNotMatch(route, /select\([^)]*status_history/);
  assert.doesNotMatch(route, /message\.content/);
  assert.doesNotMatch(route, /customer_phone/);
  assert.doesNotMatch(route, /receipt_url/);
});

test("owner dashboard UI provides range filters, refresh, action center, charts, and bounded activity", () => {
  const page = read("app/owner/page.jsx");

  assert.match(page, /Dashboard date range/);
  assert.match(page, /handleRefresh/);
  assert.match(page, /What needs your attention/);
  assert.match(page, /Orders and money over time/);
  assert.match(page, /Sales period/);
  assert.match(page, /Daily/);
  assert.match(page, /Weekly/);
  assert.match(page, /Monthly/);
  assert.match(page, /salesTrend/);
  assert.match(page, /aria-pressed/);
  assert.match(page, /Top 3 services & products/);
  assert.match(page, /label="Services"/);
  assert.match(page, /label="Products"/);
  assert.match(page, /Orders by status/);
  assert.match(page, /Pickup versus delivery/);
  assert.match(page, /Rating distribution/);
  assert.match(page, /Latest five records per list/);
  assert.match(page, /No recent orders\./);
  assert.match(page, /No customer messages yet\./);
  assert.match(page, /No upcoming meetings\./);
  assert.match(page, /No customer reviews yet\./);
  assert.match(page, /Quick actions/);
});
