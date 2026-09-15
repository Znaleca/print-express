import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("customer orders are final after placement while reviews and refund acknowledgements remain protected", async () => {
  const policyMigration = await source("supabase/migrations/20260915100000_restore_customer_order_actions.sql");
  const finalOrderMigration = await source("supabase/migrations/20260915200000_lock_checkout_payment_method_and_final_orders.sql");
  const tracking = await source("app/track/page.jsx");

  assert.match(policyMigration, /create policy "Customers can update allowed order fields"/);
  assert.match(policyMigration, /using \(customer_id = auth\.uid\(\)\)/);
  assert.match(policyMigration, /with check \(customer_id = auth\.uid\(\)\)/);
  assert.match(finalOrderMigration, /create or replace function public\.prevent_customer_order_tampering/);
  assert.match(finalOrderMigration, /Orders are final after placement/);
  assert.match(finalOrderMigration, /new\.status = 'REFUND_CONFIRMED' and old\.status = 'REFUNDED'/);
  assert.match(finalOrderMigration, /new\.status = 'REFUND_PENDING' and old\.status = 'REFUNDED'/);
  assert.match(finalOrderMigration, /review_service_id/);

  assert.match(tracking, /status: "REFUND_CONFIRMED"/);
  assert.match(tracking, /review_service_id/);
  assert.doesNotMatch(tracking, />Cancel Order</);
  assert.doesNotMatch(tracking, /> Request Refund</);
  assert.doesNotMatch(tracking, /setCancelModal/);
  assert.doesNotMatch(tracking, /setRefundRequestModal/);
});
