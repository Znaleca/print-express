import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

test("remaining payment workflow is server-calculated and protected by RLS-compatible RPCs", async () => {
  const migration = await source("supabase/migrations/20260914090000_remaining_balance_payment_workflow.sql");
  const route = await source("app/api/orders/payment-proof/route.js");

  assert.match(migration, /remaining_payment_status/);
  assert.match(migration, /customer_submit_remaining_payment/);
  assert.match(migration, /owner_review_remaining_payment/);
  assert.match(migration, /remaining_balance := greatest\(0, coalesce\(target_order\.total, 0\) - current_confirmed\)/);
  assert.match(migration, /round\(remaining_balance, 2\)/);
  assert.match(migration, /remaining_payment_status = 'APPROVED'/);
  assert.match(migration, /remaining_payment_status = 'REJECTED'/);
  assert.match(migration, /payment_source/);
  assert.match(migration, /prevent_order_payment_tampering/);
  assert.match(migration, /remaining_payment_rpc/);
  assert.match(migration, /p_requester_id uuid default null/);
  assert.match(route, /requireAuthenticatedUser/);
  assert.match(route, /MAX_PROOF_BYTES = 5 \* 1024 \* 1024/);
  assert.match(route, /image\/png[\s\S]*application\/pdf/);
  assert.match(route, /private-assets.*payments/);
  assert.match(route, /customer_submit_remaining_payment/);
  assert.match(route, /notifyOwner/);
  assert.doesNotMatch(route, /p_amount/);
});

test("customer and owner order surfaces expose remaining payment lifecycle actions", async () => {
  const track = await source("app/track/page.jsx");
  const checkout = await source("app/checkout/[id]/page.jsx");
  const orderSummary = await source("components/checkout/OrderSummary.jsx");
  const route = await source("app/api/orders/payment-proof/route.js");
  const lockMigration = await source("supabase/migrations/20260915200000_lock_checkout_payment_method_and_final_orders.sql");
  const ownerFixMigration = await source("supabase/migrations/20260915210000_fix_owner_payment_method_ambiguity.sql");
  const owner = await source("app/owner/orders/page.jsx");
  const summary = await source("lib/paymentSummary.js");
  const sql = await migrations();

  assert.match(track, /Upload payment proof/);
  assert.match(track, /Notify shop I already paid/);
  assert.match(track, /o\.payment_method === "E-Wallet"/);
  assert.match(track, /openRemainingPaymentModal\(o, remainingPaymentMethod\)/);
  assert.match(track, /remainingPaymentPending/);
  assert.match(track, /payment-proof/);
  assert.match(track, /application\/pdf/);
  assert.match(owner, /Approve payment/);
  assert.match(owner, /Reject payment/);
  assert.match(owner, /Confirm full payment/);
  assert.match(owner, /owner_review_remaining_payment/);
  assert.match(owner, /payment-proof\?orderId/);
  assert.match(owner, /application\/pdf/);
  assert.match(summary, /REMAINING_PAYMENT_AWAITING_CONFIRMATION/);
  assert.match(summary, /remainingPaymentRejected/);
  assert.match(sql, /orders_remaining_payment_status_check/);
  assert.match(sql, /CUSTOMER_COD_DECLARATION/);
  assert.match(sql, /CUSTOMER_PAYMENT_PROOF/);
  assert.match(sql, /OWNER_MANUAL/);
  assert.match(checkout, /Upload Downpayment Proof/);
  assert.match(checkout, /paymentMethod=\{paymentMethod\}/);
  assert.match(orderSummary, /Final-order notice:/);
  assert.match(orderSummary, /cannot be cancelled or refunded by the customer/);
  assert.match(route, /method !== selectedMethod/);
  assert.match(lockMigration, /normalized_method <> checkout_method/);
  assert.match(lockMigration, /Use the remaining payment method selected at checkout/);
  assert.match(ownerFixMigration, /reviewed_method text/);
  assert.doesNotMatch(ownerFixMigration, /\n\s*payment_method text;/);
  assert.match(ownerFixMigration, /remaining_payment_method = reviewed_method/);
});
