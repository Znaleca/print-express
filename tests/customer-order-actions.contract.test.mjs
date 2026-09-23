import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("customer order cancellation and refund actions follow the pending and placed policy", async () => {
  const policyMigration = await source("supabase/migrations/20260915100000_restore_customer_order_actions.sql");
  const finalOrderMigration = await source("supabase/migrations/20260915200000_lock_checkout_payment_method_and_final_orders.sql");
  const currentPolicyMigration = await source("supabase/migrations/20260923100000_customer_order_cancellation_refund_policy.sql");
  const tracking = await source("app/track/page.jsx");
  const checkout = await source("app/checkout/[id]/page.jsx");
  const orderSummary = await source("components/checkout/OrderSummary.jsx");

  assert.match(policyMigration, /create policy "Customers can update allowed order fields"/);
  assert.match(policyMigration, /using \(customer_id = auth\.uid\(\)\)/);
  assert.match(policyMigration, /with check \(customer_id = auth\.uid\(\)\)/);
  assert.match(finalOrderMigration, /create or replace function public\.prevent_customer_order_tampering/);
  assert.match(finalOrderMigration, /Orders are final after placement/);
  assert.match(finalOrderMigration, /new\.status = 'REFUND_CONFIRMED' and old\.status = 'REFUNDED'/);
  assert.match(finalOrderMigration, /new\.status = 'REFUND_PENDING' and old\.status = 'REFUNDED'/);
  assert.match(finalOrderMigration, /review_service_id/);
  assert.match(currentPolicyMigration, /new\.status = 'CANCELLED' and old\.status = 'PENDING'/);
  assert.match(currentPolicyMigration, /new\.status = 'REFUND_PENDING' and old\.status in \('PENDING', 'PLACED'\)/);
  assert.match(currentPolicyMigration, /Cancellation details are only valid while cancelling a pending order/);

  assert.match(tracking, /status: "REFUND_CONFIRMED"/);
  assert.match(tracking, /review_service_id/);
  assert.match(tracking, /handleCustomerCancel/);
  assert.match(tracking, /handleCustomerRefundRequest/);
  assert.match(tracking, /const canCustomerCancel = o\.status === "PENDING"/);
  assert.match(tracking, /const canCustomerRequestRefund = \["PENDING", "PLACED"\]/);
  assert.match(tracking, /!canCustomerCancel/);
  assert.match(checkout, /refundPolicyAgreed/);
  assert.match(orderSummary, /I agree to the order policy/);
});
