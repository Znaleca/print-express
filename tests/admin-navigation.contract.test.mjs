import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("admin navigation exposes the shop workspace and pending counts", async () => {
  const sidebar = await readFile(path.join(root, "components/admin/AdminSidebar.jsx"), "utf8");
  const dashboardPage = await readFile(path.join(root, "app/admin/page.jsx"), "utf8");
  const countsRoute = await readFile(path.join(root, "app/api/admin/counts/route.js"), "utf8");

  assert.match(sidebar, /href: "\/admin\/verifications"/);
  assert.match(sidebar, /href: "\/admin".*label: "Dashboard"/s);
  assert.match(sidebar, /href: "\/admin\/shops".*label: "Shops"/s);
  assert.match(sidebar, /href: "\/admin\/accounts"/);
  assert.doesNotMatch(sidebar, /href: "\/admin\/category-approvals"/);
  assert.match(sidebar, /href: "\/admin\/reviews".*countKey: "reviewRemovals"/s);
  assert.match(sidebar, /pathname === href \|\| pathname\.startsWith\(`\$\{href\}\/`\)/);
  assert.match(sidebar, /pendingCounts/);
  assert.match(dashboardPage, /api\/admin\/operations/);
  assert.match(dashboardPage, /Admin dashboard/);
  assert.match(countsRoute, /requireAdmin\(request\)/);
  assert.match(countsRoute, /categoryApprovals/);
  assert.match(countsRoute, /reviewRemovals/);
});

test("verification and category routes preserve admin-scoped data actions", async () => {
  const verification = await readFile(path.join(root, "components/admin/VerificationPanel.jsx"), "utf8");
  const verificationApi = await readFile(path.join(root, "app/api/admin/verifications/route.js"), "utf8");
  const category = await readFile(path.join(root, "components/admin/CategoryApprovalPanel.jsx"), "utf8");
  const accounts = await readFile(path.join(root, "app/admin/accounts/page.jsx"), "utf8");
  const reviews = await readFile(path.join(root, "app/admin/reviews/page.jsx"), "utf8");

  assert.match(verification, /api\/admin\/verifications/);
  assert.match(verificationApi, /requireAdmin\(request\)/);
  assert.match(verificationApi, /business_documents/);
  assert.match(verificationApi, /business_profile_change_requests/);
  assert.match(verificationApi, /PROFILE_COMMENT/);
  assert.match(verificationApi, /PROFILE_STATUSES/);
  assert.match(verificationApi, /PROFILE_REQUEST_ALREADY_PENDING/);
  assert.match(verificationApi, /pendingProfileChangeRequests/);
  assert.match(verification, /ProfileFieldReviewCards/);
  assert.doesNotMatch(verification, /ProfileChangeRequestsSummary/);
  assert.match(verification, /Profile change requests/);
  assert.match(verification, /api\/admin\/shops\/lifecycle/);
  assert.match(verification, /Reopen for review/);
  assert.match(verification, /Save comment/);
  assert.match(category, /api\/admin\/category-approvals/);
  assert.match(category, /Approve/);
  assert.match(category, /Reject/);
  assert.match(verification, /max-w-\[1600px\]/);
  assert.match(category, /max-w-\[1600px\]/);
  assert.match(accounts, /max-w-\[1600px\]/);
  assert.match(reviews, /max-w-\[1600px\]/);
});
