import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function migrations() {
  const directory = path.join(root, "supabase/migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  return (await Promise.all(files.map((file) => readFile(path.join(directory, file), "utf8")))).join("\n");
}

test("approved owner documents are visibly locked in both document surfaces", async () => {
  const documentsPage = await source("app/owner/documents/page.jsx");
  const ownerLayout = await source("app/owner/layout.jsx");
  const documentsApi = await source("app/api/owner/documents/route.js");

  assert.match(documentsPage, /businessStatus === "APPROVED" && allDocumentsApproved/);
  assert.match(documentsPage, /awaitingAdminApproval = allDocumentsApproved && !shopApproved/);
  assert.match(documentsPage, /Documents accepted · shop locked/);
  assert.match(documentsPage, /An Admin still needs to approve your shop/);
  assert.match(documentsPage, /isApproved\s*\?\s*\(/);
  assert.match(documentsPage, /Approved document locked/);
  assert.match(documentsPage, /View approved preview/);
  assert.match(documentsPage, /\["REJECTED",\s*"NEEDS_CHANGES",\s*"ACTION_REQUIRED"\]/);
  assert.match(ownerLayout, /status === "APPROVED" && doc/);
  assert.match(ownerLayout, /Approved · locked/);
  assert.match(ownerLayout, /An admin must request action before it can be replaced/);
  assert.match(ownerLayout, /if \(doc\?\.status === "APPROVED"\)/);
  assert.match(documentsPage, /Remove replacement file/);
  assert.match(documentsPage, /Remove uploaded file/);
  assert.match(documentsPage, /const \[uploadLoading, setUploadLoading\] = useState\(\{\}\)/);
  assert.match(documentsPage, /uploadLoading\[docType\]/);
  assert.doesNotMatch(documentsPage, /globalLoading/);
  assert.match(documentsPage, /api\/owner\/documents/);
  assert.match(documentsPage, /previewDocIsImage/);
  assert.match(documentsPage, /overflow-hidden/);
  assert.match(documentsPage, /max-h-\[calc\(94vh-8rem\)\]/);
  assert.match(documentsPage, /owner_documents_verification/);
  assert.match(documentsApi, /export async function DELETE/);
  assert.match(documentsApi, /DOCUMENT_LOCKED/);
  assert.match(documentsApi, /business_documents/);
});

test("owner access and data mutations require complete verification and explicit shop approval", async () => {
  const ownerLayout = await source("app/owner/layout.jsx");
  const ownerShop = await source("app/owner/shop/page.jsx");
  const ownerOrders = await source("app/owner/orders/page.jsx");
  const browse = await source("app/browse/page.jsx");
  const business = await source("app/business/[id]/page.jsx");
  const checkout = await source("app/checkout/[id]/page.jsx");
  const sql = await migrations();

  assert.match(ownerLayout, /hasAllRequiredDocumentsApproved/);
  assert.match(ownerLayout, /business\.status === "APPROVED" && documentsApproved/);
  assert.match(ownerLayout, /router\.replace\("\/owner\/documents"\)/);
  assert.match(ownerLayout, /business_documents/);
  assert.match(ownerShop, /manual_open_override/);
  assert.match(ownerOrders, /owner_advance_order_status/);
  assert.match(browse, /eq\("status", "APPROVED"\)/);
  assert.match(browse, /eq\("lifecycle_state", "ACTIVE"\)/);
  assert.match(business, /eq\("status", "APPROVED"\)/);
  assert.match(business, /eq\("lifecycle_state", "ACTIVE"\)/);
  assert.match(checkout, /rpc\("place_order_atomic"/);
  assert.match(sql, /prevent_owner_verification_tampering/);
  assert.match(sql, /sync_business_verification_lock/);
  assert.match(sql, /is_business_verification_complete/);
  assert.match(sql, /orders_business_verification_lock/);
  assert.match(sql, /Shop must be approved and active before it can be opened/);
  assert.match(sql, /orders_owner_verification_lock/);
  assert.match(sql, /Shop verification is not active/);
  assert.match(sql, /status = 'PENDING'/);
  assert.match(sql, /manual_open_override = null/);
});

test("owner shop phone input keeps the country code out of the textbox and saves it once", async () => {
  const shop = await source("app/owner/shop/page.jsx");
  const phone = await source("lib/phone.js");

  assert.match(shop, /toPhilippinePhoneInput\(value\)/);
  assert.match(shop, /phone: toPhilippinePhoneInput\(biz\.phone \|\| ""\)/);
  assert.match(shop, /phone: normalizedPhone/);
  assert.match(shop, /phone: toPhilippinePhoneInput\(normalizedPhone\)/);
  assert.match(phone, /if \(digits\.startsWith\("63"\)\) digits = digits\.slice\(2\)/);
  assert.match(phone, /return `\+63\$\{digits\}`/);
});

test("owner shop save action floats whenever there are unsaved changes", async () => {
  const shop = await source("app/owner/shop/page.jsx");

  assert.match(shop, /data-floating-save=\{hasUnsavedChanges \? "true" : "false"\}/);
  assert.match(shop, /hasUnsavedChanges[\s\S]*?"fixed bottom-4 left-1\/2 z-50 flex w-\[calc\(100vw-2rem\)\] max-w-3xl -translate-x-1\/2 items-center gap-4/);
  assert.match(shop, /hasUnsavedChanges \? "w-auto min-w-\[150px\] shrink-0" : "mt-4 w-full"/);
  assert.match(shop, /hasUnsavedChanges \? "pb-56 sm:pb-40" : "pb-20"/);
  assert.match(shop, /disabled=\{saving \|\| !hasUnsavedChanges\}/);
});

test("owners can edit pending profile fields and must request approved changes", async () => {
  const shop = await source("app/owner/shop/page.jsx");
  const documents = await source("app/owner/documents/page.jsx");
  const migration = await source("supabase/migrations/20260915120000_business_profile_review_workflow.sql");
  const fieldReviewMigration = await source("supabase/migrations/20260915150000_profile_change_field_review.sql");

  assert.match(shop, /businessStatus === "APPROVED"/);
  assert.doesNotMatch(shop, /disabled=\{businessStatus === "APPROVED"\}/);
  assert.match(shop, /payload\.name = trimmedName/);
  assert.match(shop, /payload\.description = form\.description\.trim\(\)/);
  assert.match(shop, /You can update this shop name anytime/);
  assert.match(documents, /savePreApprovalProfile/);
  assert.doesNotMatch(documents, /saveApprovedShopName/);
  assert.match(documents, /Preview only on this page/);
  assert.doesNotMatch(documents, /requested_name: name/);
  assert.match(documents, /Request profile change/);
  assert.match(documents, /profile-change-scope/);
  assert.match(documents, /PRODUCT_SERVICE_OPTIONS/);
  assert.match(documents, /type="checkbox"/);
  assert.match(documents, /requested_description: requestsDescription \? description : null/);
  assert.match(documents, /requested_products_summary: requestsProducts \? productsSummary : null/);
  assert.match(documents, /table: "business_profile_change_requests"/);
  assert.match(documents, /setProfileRequests\(requests \|\| \[\]\)/);
  assert.match(migration, /old\.status::text = 'APPROVED'/);
  assert.match(migration, /new\.description_review_status := 'PENDING'/);
  assert.match(migration, /new\.products_review_status := 'PENDING'/);
  assert.match(fieldReviewMigration, /change_scope in \('BACKGROUND', 'PRODUCTS', 'BOTH'\)/);
  assert.match(fieldReviewMigration, /admin_apply_business_profile_change/);
  assert.match(fieldReviewMigration, /for insert to authenticated/);
});

test("order workflow is sequential in UI and database", async () => {
  const ordersPage = await source("app/owner/orders/page.jsx");
  const sql = await migrations();
  const latestWorkflow = await source("supabase/migrations/20260913180000_owner_inactivity_30_days_and_order_rpc.sql");

  assert.match(ordersPage, /\["PENDING",\s*"PLACED",\s*"PREPARING",\s*"RIDER_ON_THE_WAY",\s*"DELIVERY_COMPLETED"\]/);
  assert.match(ordersPage, /\["PENDING",\s*"PLACED",\s*"PREPARING",\s*"READY_TO_PICK_UP",\s*"COMPLETED"\]/);
  assert.match(ordersPage, /const isNext = step === nextStatus/);
  assert.match(ordersPage, /onRequestUpdateStatus=\{\(nextStatus\) => requestStatusUpdate\(o\.id, o, nextStatus\)\}/);
  assert.match(ordersPage, /Update status/);
  assert.match(ordersPage, /Next status:/);
  assert.match(ordersPage, /Update order status\?/);
  assert.match(ordersPage, /Yes, update status/);
  assert.match(ordersPage, /setStatusConfirmModal\(\{\s*orderId,\s*currentStatus: order\.status/);
  assert.match(ordersPage, /void handleUpdateStatus\(orderId, nextStatus\)/);
  assert.match(ordersPage, /<div className="pb-1" aria-label="Order status timeline">/);
  assert.match(ordersPage, /<ol className="flex w-full items-center gap-0" aria-label="Order status progress">/);
  assert.match(ordersPage, /h-0\.5 w-2 shrink-0 sm:w-8/);
  assert.doesNotMatch(ordersPage, /onClick=\{\(\) => isNext && onSelect\?\.\(step\)\}/);
  assert.match(ordersPage, /stepStateClass = isComplete[\s\S]*grayscale/);
  assert.match(ordersPage, /COMPLETED_STATUSES = \["COMPLETED", "DELIVERY_COMPLETED"\]/);
  assert.match(ordersPage, /COMPLETED_STATUSES\.includes\(o\.status\) \? "grayscale"/);
  assert.match(ordersPage, /rpc\("owner_advance_order_status"/);
  assert.match(ordersPage, /p_next_status: newStatus,[\s\S]*p_order_id: orderId/);
  assert.match(sql, /expected_owner_order_next_status/);
  assert.match(sql, /orders_status_transition_guard/);
  assert.match(sql, /owner_advance_order_status/);
  assert.match(sql, /Invalid order status transition from/);
  assert.match(sql, /can_manage_protected_upload[\s\S]*?d\.status = 'APPROVED'[\s\S]*?RETURN FALSE/);
  assert.match(latestWorkflow, /create function public\.owner_advance_order_status\([\s\S]*p_next_status text,[\s\S]*p_order_id uuid/);
  assert.match(latestWorkflow, /drop function if exists public\.owner_advance_order_status\(uuid, text\)/);
  assert.match(latestWorkflow, /notify pgrst, 'reload schema'/);
});

test("payment summaries use the final total and never show a negative balance", async () => {
  const paymentSummary = await source("lib/paymentSummary.js");
  const ownerOrders = await source("app/owner/orders/page.jsx");
  const tracking = await source("app/track/page.jsx");
  const receipt = await source("components/ReceiptModal.jsx");
  const sms = await source("app/api/orders/status-sms/route.js");

  assert.match(paymentSummary, /Math\.max\(0, total - confirmedAmount\)/);
  assert.match(paymentSummary, /confirmed_payment_amount/);
  assert.match(paymentSummary, /Payment proof awaiting confirmation/);
  assert.match(paymentSummary, /storedBalanceMatches/);
  assert.match(paymentSummary, /Total & Balance/);
  assert.match(ownerOrders, /Total &amp; Balance/);
  assert.match(ownerOrders, /formatPesoAmount\(payment\.total\)/);
  assert.match(ownerOrders, /formatPesoAmount\(payment\.balance\)/);
  assert.match(tracking, /formatPesoAmount\(payment\.balance\)/);
  assert.match(receipt, /const grandTotal = payment\.total \?\? calculatedTotal/);
  assert.match(sms, /downpayment_amount, balance_amount/);
  assert.match(sms, /formatOrderPaymentSummaryForSms\(order\)/);
  assert.match(sms, /message_content.*messageContent|messageContent.*message_content/);
});

test("owner payment confirmation gates completion and notifies the customer", async () => {
  const ownerOrders = await source("app/owner/orders/page.jsx");
  const tracking = await source("app/track/page.jsx");
  const notificationRoute = await source("app/api/orders/payment-notification/route.js");
  const paymentSummary = await source("lib/paymentSummary.js");
  const paymentMigration = await source("supabase/migrations/20260913220000_owner_payment_confirmation.sql");

  assert.match(ownerOrders, /owner_confirm_order_payment/);
  assert.match(ownerOrders, /Confirm payment/);
  assert.match(ownerOrders, /Request remaining payment/);
  assert.match(ownerOrders, /payment\.isPaymentConfirmed/);
  assert.match(ownerOrders, /Payment required/);
  assert.match(ownerOrders, /payment-notification/);
  assert.match(tracking, /Confirmed Paid/);
  assert.match(tracking, /payment\.statusLabel/);
  assert.match(tracking, /Thank you\. We appreciate your support\. Your order has been completed\./);
  assert.match(paymentSummary, /canComplete: isPaymentConfirmed/);
  assert.match(notificationRoute, /BALANCE_DUE/);
  assert.match(notificationRoute, /COMPLETION/);
  assert.match(notificationRoute, /order_notification_events/);
  assert.match(notificationRoute, /sendResendEmail/);
  assert.match(notificationRoute, /normalizePhilippinePhone/);
  assert.match(notificationRoute, /review=\$\{encodeURIComponent\(order\.id\)\}/);
  assert.match(notificationRoute, /Review this service or product/);
  assert.match(notificationRoute, /Thank you for ordering/);
  assert.doesNotMatch(ownerOrders, /\["PLACED",\s*"PREPARING",\s*"READY_TO_PICK_UP",\s*"RIDER_ON_THE_WAY",\s*"DELIVERY_COMPLETED",\s*"COMPLETED"\]/);
  assert.match(tracking, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(tracking, /id=\{`review-\$\{o\.id\}`\}/);
  assert.match(paymentMigration, /create function public\.owner_confirm_order_payment\([\s\S]*p_order_id uuid[\s\S]*p_amount numeric/);
  assert.match(paymentMigration, /order_payment_confirmations/);
  assert.match(paymentMigration, /Payment confirmation required before completion/);
  assert.match(paymentMigration, /target_order\.fully_paid is not true/);
  assert.match(paymentMigration, /revoke all on function public\.owner_confirm_order_payment/);
});

test("owner inactivity uses a 30-day server policy and excludes Admin profiles", async () => {
  const ownerLayout = await source("app/owner/layout.jsx");
  const lifecycle = await source("supabase/migrations/20260913180000_owner_inactivity_30_days_and_order_rpc.sql");

  assert.match(ownerLayout, /Automatically locked after 30 days/);
  assert.match(lifecycle, /values \(true, 30\)/);
  assert.match(lifecycle, /owner_inactivity_days\(\)/);
  assert.match(lifecycle, /p\.role = 'BUSINESS_OWNER'/);
  assert.match(lifecycle, /and b\.last_activity_at <= now\(\) - make_interval\(days => public\.owner_inactivity_days\(\)\)/);
  assert.match(lifecycle, /auto_lock_inactive_shops[\s\S]*?p\.role = 'BUSINESS_OWNER'/);
  assert.match(lifecycle, /record_owner_sign_in[\s\S]*?p\.role = 'BUSINESS_OWNER'/);
  assert.match(lifecycle, /owner_reactivate_shop[\s\S]*?p\.role = 'BUSINESS_OWNER'/);
  assert.doesNotMatch(lifecycle, /role\s*=\s*'ADMIN'[\s\S]*?AUTO_LOCK/);
});

test("meeting requests are visible to owners and deduplicated for customers", async () => {
  const ownerMessages = await source("app/owner/messages/page.jsx");
  const ownerList = await source("components/messages/OwnerConversationList.jsx");
  const customerMessages = await source("app/messages/page.jsx");

  assert.match(ownerMessages, /pendingVideoRequests/);
  assert.match(ownerMessages, /Online meeting request/);
  assert.match(ownerMessages, /Schedule \/ accept/);
  assert.match(ownerMessages, /Decline/);
  assert.match(ownerList, /meetingRequestIds/);
  assert.match(customerMessages, /Online meeting requested/);
  assert.match(customerMessages, /\["REQUESTED",\s*"SCHEDULED",\s*"LIVE"\]/);
});

test("document generator exposes only receipt and quotation outputs", async () => {
  const receipt = await source("components/ReceiptModal.jsx");
  const ownerOrders = await source("app/owner/orders/page.jsx");
  const track = await source("app/track/page.jsx");

  assert.match(receipt, /Official Receipt/);
  assert.match(receipt, /Formal Quotation/);
  assert.doesNotMatch(receipt, /Delivery Receipt|Sales Invoice/);
  assert.doesNotMatch(ownerOrders, /Delivery Receipt|Sales Invoice/);
  assert.doesNotMatch(track, />\s*Delivery\s*</);
  assert.doesNotMatch(track, />\s*Invoice\s*</);
  assert.match(receipt, /SUBTOTAL/);
  assert.match(receipt, /TAX \/ VAT/);
  assert.match(receipt, /DOWNPAYMENT/);
  assert.match(receipt, /Customer approval/);
});

test("owner profile surfaces require the customer-facing setup fields", async () => {
  const shop = await source("app/owner/shop/page.jsx");
  const account = await source("app/account-settings/page.jsx");

  assert.match(shop, /Profile readiness/);
  assert.match(shop, /business name/);
  assert.match(shop, /phone number/);
  assert.match(shop, /map pin/);
  assert.match(shop, /required customer-facing details are complete/i);
  assert.match(account, /Enter your name before saving your profile/);
  assert.match(account, /Full name/);
  assert.match(account, /aria-required="true"/);
});
