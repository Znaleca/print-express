const isMissingAmount = (value) => value === null || value === undefined || value === "";

function normalizeAmount(value, fallback = null) {
  if (isMissingAmount(value)) return fallback;

  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : fallback;
}

const PAYMENT_STATUS_LABELS = {
  PAYMENT_REQUIRED: "Payment required",
  PARTIALLY_PAID: "Partially paid",
  PROOF_AWAITING_CONFIRMATION: "Payment proof awaiting confirmation",
  REMAINING_PAYMENT_AWAITING_CONFIRMATION: "Remaining payment awaiting confirmation",
  REMAINING_PAYMENT_REJECTED: "Remaining payment needs resubmission",
  PAID_IN_FULL: "Paid in full",
  PAYMENT_CONFIRMED: "Payment confirmed",
};

/**
 * Order totals are finalized by the checkout RPC. The stored balance is kept
 * for compatibility, but a payment-confirmation snapshot is authoritative when
 * it exists. Uploaded proof is evidence only until an owner confirms it.
 */
export function getOrderPaymentSummary(order) {
  const total = normalizeAmount(order?.total);
  const downpayment = normalizeAmount(order?.downpayment_amount, 0);
  const hasConfirmationSnapshot = order && Object.prototype.hasOwnProperty.call(order, "confirmed_payment_amount");
  const legacyConfirmedAmount = order?.fully_paid ? total : downpayment;
  const confirmedAmount = normalizeAmount(
    hasConfirmationSnapshot ? order?.confirmed_payment_amount : legacyConfirmedAmount,
    0,
  );
  const balance = total === null ? null : Math.max(0, total - confirmedAmount);
  const storedBalance = normalizeAmount(order?.balance_amount);
  const paymentProofPresent = Boolean(
    String(order?.receipt_url || "").trim()
      || String(order?.payment_proof_url || "").trim()
      || String(order?.remaining_payment_proof_url || "").trim(),
  );
  const remainingPaymentStatus = String(order?.remaining_payment_status || "NOT_SUBMITTED").toUpperCase();
  const remainingPaymentMethod = order?.remaining_payment_method || null;
  const remainingPaymentProofPresent = Boolean(String(order?.remaining_payment_proof_url || "").trim());
  const remainingPaymentPending = ["SUBMITTED", "UNDER_REVIEW"].includes(remainingPaymentStatus);
  const remainingPaymentRejected = remainingPaymentStatus === "REJECTED";
  const isPaidInFull = total !== null && balance === 0;
  const isPaymentConfirmed = isPaidInFull && (
    order?.payment_confirmation_status === "CONFIRMED"
      || Boolean(order?.payment_confirmed_at)
      || (!hasConfirmationSnapshot && order?.fully_paid === true)
  );
  const paymentMethod = String(order?.payment_method || "").trim();
  const canConfirm = isAvailable(total)
    && !isPaymentConfirmed
    && (paymentMethod.toLowerCase() !== "e-wallet" || paymentProofPresent);
  const status = !isAvailable(total)
    ? "PAYMENT_REQUIRED"
    : isPaymentConfirmed
      ? "PAYMENT_CONFIRMED"
      : isPaidInFull
        ? "PAID_IN_FULL"
        : remainingPaymentPending
          ? "REMAINING_PAYMENT_AWAITING_CONFIRMATION"
          : remainingPaymentRejected
            ? "REMAINING_PAYMENT_REJECTED"
        : confirmedAmount > 0
          ? "PARTIALLY_PAID"
          : paymentProofPresent
            ? "PROOF_AWAITING_CONFIRMATION"
            : "PAYMENT_REQUIRED";

  return {
    total,
    downpayment,
    requestedDownpayment: downpayment,
    confirmedAmount,
    balance,
    storedBalance,
    storedBalanceMatches: balance !== null && storedBalance !== null && Math.abs(storedBalance - balance) < 0.01,
    isAvailable: total !== null,
    isPaidInFull,
    isPaymentConfirmed,
    paymentProofPresent,
    remainingPaymentStatus,
    remainingPaymentMethod,
    remainingPaymentProofPresent,
    remainingPaymentPending,
    remainingPaymentRejected,
    paymentMethod,
    canConfirm,
    status,
    statusLabel: PAYMENT_STATUS_LABELS[status],
    canComplete: isPaymentConfirmed,
  };
}

function isAvailable(value) {
  return value !== null;
}

export function formatPesoAmount(value, unavailableLabel = "Unavailable") {
  const amount = normalizeAmount(value);
  return amount === null ? unavailableLabel : `₱${amount.toFixed(2)}`;
}

export function formatOrderPaymentSummaryForSms(order) {
  const payment = getOrderPaymentSummary(order);
  return [
    "Total & Balance",
    `Total: ${formatPesoAmount(payment.total)}`,
    `Downpayment: ${formatPesoAmount(payment.downpayment)}`,
    `Confirmed payments: ${formatPesoAmount(payment.confirmedAmount)}`,
    `Balance: ${formatPesoAmount(payment.balance)}`,
  ].join("\n");
}
