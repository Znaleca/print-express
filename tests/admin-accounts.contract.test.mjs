import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("verification documents can be revisited and reviewed through the protected workflow", async () => {
  const page = await readFile(path.join(root, "components/admin/VerificationPanel.jsx"), "utf8");

  assert.match(page, /document\.status === "APPROVED"/);
  assert.match(page, /Accepted/);
  assert.match(page, /Needs changes/);
  assert.match(page, /aria-label={`Review \$\{document\.label\} again`}/);
  assert.match(page, /<RefreshCcw size=\{14\} aria-hidden="true" \/>/);
  assert.match(page, /reviewingDocIds/);
  assert.match(page, /displayedDocumentStatus = isReviewing \? "PENDING" : document.status/);
  assert.match(page, /isReviewingAnyDocument/);
  assert.match(page, /!isReviewingAnyDocument/);
  assert.match(page, /Pending review/);
  assert.match(page, /handleDocumentAction\(shop, document, "APPROVED"/);
  assert.match(page, /openRejectForm\(shop, document\)/);
  assert.match(page, /deriveVerificationState/);
  assert.match(page, /updateShopDocumentState/);
  assert.match(page, /updateVerificationTotals/);
  assert.match(page, /nextDocuments/);
  assert.match(page, /Accept/);
  assert.match(page, /Reject/);
});

test("admin image previews fit the viewport without internal image scrolling", async () => {
  const page = await readFile(path.join(root, "components/admin/VerificationPanel.jsx"), "utf8");

  assert.match(page, /function isImageDocumentUrl/);
  assert.match(page, /split\(\/\[\?\#\]\/\)/);
  assert.match(page, /isImageDocumentUrl\(preview\.url\)/);
  assert.match(page, /overflow-hidden rounded-xl border border-slate-200 bg-slate-50/);
  assert.match(page, /max-h-\[calc\(92vh-10rem\)\]/);
});

test("replacement uploads return documents to pending admin review", async () => {
  const ownerPage = await readFile(path.join(root, "app/owner/documents/page.jsx"), "utf8");
  const adminPage = await readFile(path.join(root, "components/admin/VerificationPanel.jsx"), "utf8");

  assert.match(ownerPage, /status: "PENDING"/);
  assert.match(ownerPage, /\["REJECTED", "NEEDS_CHANGES", "ACTION_REQUIRED"\]/);
  assert.match(adminPage, /const isFinal = document\.status === "APPROVED" \|\| document\.status === "REJECTED"/);
});

test("verification API enforces scoped document actions and gated final approval", async () => {
  const route = await readFile(path.join(root, "app/api/admin/verifications/route.js"), "utf8");
  const migration = await readFile(path.join(root, "supabase/migrations/20260913140000_admin_verification_approval_guard.sql"), "utf8");
  const page = await readFile(path.join(root, "components/admin/VerificationPanel.jsx"), "utf8");

  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /SHOP_PAGE_SIZE = 15/);
  assert.match(route, /VALID_FILTERS/);
  assert.match(route, /DTI/);
  assert.match(route, /MAYORS_PERMIT/);
  assert.match(route, /business_documents/);
  assert.match(route, /action === "DOCUMENT"/);
  assert.match(route, /eq\("business_id", businessId\)/);
  assert.match(route, /ALL_REQUIRED_DOCUMENTS_MUST_BE_APPROVED/);
  assert.match(route, /admin_set_business_status/);
  assert.match(route, /action === "SHOP"/);
  assert.match(migration, /approved_required_documents/);
  assert.match(migration, /approved_required_documents <> 4/);
  assert.match(migration, /revoke all on function public\.admin_set_business_status/);
  assert.match(page, /Approve this shop/);
  assert.match(page, /All four required documents are accepted/);
  assert.match(page, /minLength=\{5\}/);
  assert.match(page, /Reject document/);
  assert.doesNotMatch(page, /autoApproveBusiness/);
});

test("admin account directory separates roles and supports protected pagination and filters", async () => {
  const page = await readFile(path.join(root, "app/admin/accounts/page.jsx"), "utf8");
  const api = await readFile(path.join(root, "app/api/admin/dashboard/route.js"), "utf8");

  assert.match(page, /const ACCOUNT_PAGE_SIZE = 15/);
  assert.match(page, /key: "CUSTOMER", label: "Customers"/);
  assert.match(page, /key: "BUSINESS_OWNER", label: "Business Owners"/);
  assert.match(page, /accountSearch/);
  assert.match(page, /accountDateFilter/);
  assert.match(page, /accountProfileFilter/);
  assert.match(page, /visibleAccounts/);
  assert.match(page, /Previous account page/);
  assert.match(page, /Next account page/);
  assert.match(page, /md:hidden/);
  assert.match(page, /hidden overflow-x-auto/);
  assert.match(api, /requireAdmin\(request\)/);
});

test("accounts page is directory-only and workflows have dedicated routes", async () => {
  const accountsPage = await readFile(path.join(root, "app/admin/accounts/page.jsx"), "utf8");
  const verificationPage = await readFile(path.join(root, "app/admin/verifications/page.jsx"), "utf8");
  const categoryPage = await readFile(path.join(root, "app/admin/category-approvals/page.jsx"), "utf8");

  assert.doesNotMatch(accountsPage, /Verification Requests|Category Approvals|business_documents|category_approval_requests/);
  assert.match(verificationPage, /VerificationPanel/);
  assert.match(categoryPage, /CategoryApprovalPanel/);
});
