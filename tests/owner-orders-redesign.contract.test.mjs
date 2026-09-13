import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("owner orders keeps the redesign scan-first while preserving order actions", async () => {
  const page = await readFile(path.join(root, "app/owner/orders/page.jsx"), "utf8");

  assert.match(page, /<h1[^>]*>Orders<\/h1>/);
  assert.match(page, /Total orders/);
  assert.match(page, /onClick=\{refreshOrders\}/);
  assert.match(page, /disabled=\{refreshing\}/);
  assert.match(page, /\["New orders", newOrderCount/);
  assert.match(page, /\["In production", inProductionCount/);
  assert.match(page, /\["Ready", readyCount/);
  assert.match(page, /\["Completed", completedCount/);
  assert.match(page, /\["Refunds \/ cancelled", refundCount/);

  assert.match(page, /const expandedOrderId =|const \[expandedOrderId, setExpandedOrderId\]/);
  assert.match(page, /aria-expanded=\{isExpanded\}/);
  assert.match(page, /View details/);
  assert.match(page, /Hide details/);
  assert.match(page, /order-details-\$\{o\.id\}/);
  assert.match(page, /const ORDER_PAGE_SIZE = 5/);
  assert.match(page, /Reset search and filters/);

  assert.match(page, /getOrderPaymentSummary\(o\)/);
  assert.match(page, /Paid in full/);
  assert.match(page, /o\.tax_amount/);
  assert.match(page, /o\.discount_amount/);
  assert.match(page, /o\.delivery_fee/);
  assert.match(page, /delivery_address/);
  assert.match(page, /delivery_coordinates/);
  assert.match(page, /<LocationPicker/);
  assert.match(page, /View delivery map/);
  assert.match(page, /eventType === "DELETE"/);
  assert.match(page, /const stepStateClass = isComplete/);
  assert.match(page, /border-2 border-slate-300 bg-slate-100 text-slate-500 grayscale/);
});
