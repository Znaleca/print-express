import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("category approvals are protected, shop-grouped, searchable, and paginated", async () => {
  const route = await readFile(path.join(root, "app/api/admin/category-approvals/route.js"), "utf8");
  const panel = await readFile(path.join(root, "components/admin/CategoryApprovalPanel.jsx"), "utf8");

  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /business_id/);
  assert.match(route, /pendingCount/);
  assert.match(route, /approvedCount/);
  assert.match(route, /rejectedCount/);
  assert.match(route, /selectedShopId/);
  assert.match(route, /requestPage/);
  assert.match(route, /MAX_REQUEST_ROWS/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /ACTION_STATUSES/);
  assert.match(panel, /api\/admin\/category-approvals/);
  assert.match(panel, /Search shops, owners, or categories/);
  assert.match(panel, /selectedShopId/);
  assert.match(panel, /label="Shop"/);
  assert.match(panel, /label="Request"/);
  assert.match(panel, /handleCategoryAction/);
  assert.doesNotMatch(panel, /from\("category_approval_requests"\)/);
});

test("reviews are protected, flat, searchable, paginated, and moderation-capable", async () => {
  const route = await readFile(path.join(root, "app/api/admin/reviews/route.js"), "utf8");
  const page = await readFile(path.join(root, "app/admin/reviews/page.jsx"), "utf8");

  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /feedback_hidden/);
  assert.match(route, /averageRating/);
  assert.match(route, /summary\.visible/);
  assert.match(route, /summary\.hidden/);
  assert.match(route, /itemReviewRows/);
  assert.match(route, /review_type/);
  assert.match(route, /VALID_REVIEW_STATES/);
  assert.match(route, /pendingOrderIds/);
  assert.match(route, /pendingItemReviewIds/);
  assert.match(route, /pendingRequestMap/);
  assert.match(route, /pending_request/);
  assert.match(route, /reviewState/);
  assert.match(route, /reviewPage/);
  assert.match(route, /MAX_REVIEW_ROWS/);
  assert.match(route, /reviewPagination/);
  assert.match(route, /set_admin_item_review_visibility/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /set_admin_review_visibility/);
  assert.match(route, /moderate_review_removal/);
  assert.match(page, /api\/admin\/reviews/);
  assert.match(page, /Search shops, owners, customers, or text/);
  assert.doesNotMatch(page, /Preview all pending requests/);
  assert.match(page, /PENDING ADMIN REVIEW/);
  assert.match(page, /Approve &amp; hide comment/);
  assert.match(page, /All customer reviews/);
  assert.match(page, /Comments hidden/);
  assert.match(page, /Review filters/);
  assert.match(page, /Pending requests/);
  assert.match(page, /Hidden comments/);
  assert.match(page, /Visible comments/);
  assert.match(page, /reviewFilter/);
  assert.match(page, /Highest rated/);
  assert.match(page, /Lowest rated/);
  assert.doesNotMatch(page, /selectedShopId/);
  assert.doesNotMatch(page, /Reviewed shops/);
  assert.match(page, /reviewPagination/);
  assert.match(page, /updateReviewVisibility/);
  assert.doesNotMatch(page, /from\("business_reviews"\)/);
});
