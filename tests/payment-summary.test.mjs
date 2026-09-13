import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadPaymentSummary() {
  const source = await readFile(path.join(root, "lib/paymentSummary.js"), "utf8");
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

test("payment summary covers downpayment, full payment, overpayment, and missing values", async () => {
  const { formatOrderPaymentSummaryForSms, formatPesoAmount, getOrderPaymentSummary } = await loadPaymentSummary();

  const partial = getOrderPaymentSummary({ total: 200, downpayment_amount: 40, balance_amount: 999 });
  assert.equal(partial.total, 200);
  assert.equal(partial.downpayment, 40);
  assert.equal(partial.confirmedAmount, 40);
  assert.equal(partial.balance, 160);
  assert.equal(partial.storedBalance, 999);
  assert.equal(partial.storedBalanceMatches, false);
  assert.equal(partial.isAvailable, true);
  assert.equal(partial.isPaidInFull, false);
  assert.equal(partial.status, "PARTIALLY_PAID");
  assert.equal(partial.canComplete, false);
  assert.equal(getOrderPaymentSummary({ total: 200 }).downpayment, 0);
  assert.equal(getOrderPaymentSummary({ total: 200, downpayment_amount: 200 }).balance, 0);
  assert.equal(getOrderPaymentSummary({ total: 200, downpayment_amount: 250 }).balance, 0);
  const unavailable = getOrderPaymentSummary({ total: null, downpayment_amount: null });
  assert.equal(unavailable.total, null);
  assert.equal(unavailable.downpayment, 0);
  assert.equal(unavailable.balance, null);
  assert.equal(unavailable.storedBalance, null);
  assert.equal(unavailable.storedBalanceMatches, false);
  assert.equal(unavailable.isAvailable, false);
  assert.equal(unavailable.isPaidInFull, false);
  assert.equal(unavailable.status, "PAYMENT_REQUIRED");
  assert.equal(formatPesoAmount(200), "₱200.00");

  const sms = formatOrderPaymentSummaryForSms({ total: 200, downpayment_amount: 40 });
  assert.equal(sms, "Total & Balance\nTotal: ₱200.00\nDownpayment: ₱40.00\nConfirmed payments: ₱40.00\nBalance: ₱160.00");
});

test("confirmed payment snapshot is authoritative and exposes payment lifecycle states", async () => {
  const { getOrderPaymentSummary } = await loadPaymentSummary();

  const proofAwaiting = getOrderPaymentSummary({
    total: 200,
    downpayment_amount: 40,
    confirmed_payment_amount: 0,
    receipt_url: "proof.png",
    payment_method: "E-Wallet",
  });
  assert.equal(proofAwaiting.confirmedAmount, 0);
  assert.equal(proofAwaiting.balance, 200);
  assert.equal(proofAwaiting.status, "PROOF_AWAITING_CONFIRMATION");
  assert.equal(proofAwaiting.canConfirm, true);

  const confirmed = getOrderPaymentSummary({
    total: 200,
    downpayment_amount: 40,
    confirmed_payment_amount: 200,
    payment_confirmation_status: "CONFIRMED",
  });
  assert.equal(confirmed.confirmedAmount, 200);
  assert.equal(confirmed.balance, 0);
  assert.equal(confirmed.status, "PAYMENT_CONFIRMED");
  assert.equal(confirmed.isPaymentConfirmed, true);
  assert.equal(confirmed.canComplete, true);
});

test("stored tax and discount fields do not get applied twice to the final total", async () => {
  const { getOrderPaymentSummary } = await loadPaymentSummary();
  const summary = getOrderPaymentSummary({
    total: 200,
    subtotal: 210,
    tax_amount: 10,
    discount_amount: 20,
    downpayment_amount: 40,
  });

  assert.equal(summary.total, 200);
  assert.equal(summary.balance, 160);
});
