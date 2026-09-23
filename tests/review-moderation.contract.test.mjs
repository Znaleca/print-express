import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("review moderation keeps owner requests separate from Admin decisions", async () => {
  const migration = await source("supabase/migrations/20260913250000_review_moderation_requests_and_filter.sql");
  const ownerRoute = await source("app/api/owner/reviews/route.js");
  const adminRoute = await source("app/api/admin/reviews/route.js");
  const ownerPage = await source("app/owner/reviews/page.jsx");
  const adminPage = await source("app/admin/reviews/page.jsx");
  const ratingPreservationMigration = await source("supabase/migrations/20260923110000_admin_reviews_flat_and_rating_preservation.sql");

  assert.match(migration, /create table if not exists public\.review_moderation_requests/);
  assert.match(migration, /review_moderation_requests_one_pending_idx/);
  assert.match(migration, /create table if not exists public\.review_moderation_history/);
  assert.match(migration, /request_review_removal/);
  assert.match(migration, /moderate_review_removal/);
  assert.match(migration, /set_admin_review_visibility/);
  assert.match(migration, /case when p_hidden then 'HIDDEN' else 'RESTORED' end/);
  assert.match(migration, /revoke select \(feedback\) on public\.orders from anon, authenticated/);
  assert.match(migration, /feedback_masked/);

  assert.match(ownerRoute, /requireAuthenticatedUser\(request\)/);
  assert.match(ownerRoute, /request_review_removal/);
  assert.match(ownerRoute, /feedback: row\.feedback_masked/);
  assert.match(adminRoute, /requireAdmin\(request\)/);
  assert.match(adminRoute, /moderate_review_removal/);
  assert.match(adminRoute, /set_admin_review_visibility/);
  assert.match(adminRoute, /set_admin_item_review_visibility/);
  assert.doesNotMatch(adminRoute, /getItemName/);
  assert.match(ownerPage, /Request review removal/);
  assert.match(ownerPage, /This review remains visible/);
  assert.doesNotMatch(adminPage, /Preview all pending requests/);
  assert.match(adminPage, /PENDING ADMIN REVIEW/);
  assert.match(adminPage, /Approve &amp; hide comment/);
  assert.match(ratingPreservationMigration, /case when coalesce\(new\.feedback_hidden, false\) then null/);
  assert.match(ratingPreservationMigration, /create or replace function public\.set_admin_item_review_visibility/);
  assert.match(ratingPreservationMigration, /where public\.is_business_customer_visible\(r\.business_id\)/);
  assert.match(ratingPreservationMigration, /Admins can read all item reviews/);
  assert.match(adminPage, /Offensive-word filter/);
});

test("customer review flow selects a real order item and reads masked feedback", async () => {
  const tracking = await source("app/track/page.jsx");
  const publicShop = await source("app/business/[id]/page.jsx");
  const filterRoute = await source("app/api/admin/review-filters/route.js");

  assert.match(tracking, /CUSTOMER_ORDER_SELECT/);
  assert.match(tracking, /feedback_masked/);
  assert.match(tracking, /review_service_id/);
  assert.match(tracking, /Which service or product are you reviewing\?/);
  assert.match(tracking, /\.select\("feedback_masked, review_service_id"\)/);
  assert.match(publicShop, /from\("visible_business_reviews"\)/);
  assert.match(publicShop, /serviceRatingStats/);
  assert.match(publicShop, /No ratings yet/);
  assert.match(filterRoute, /requireAdmin\(request\)/);
  assert.match(filterRoute, /matchWholeWord/);
  assert.match(filterRoute, /review_offensive_words/);
});
