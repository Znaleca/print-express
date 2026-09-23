import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";
import { getAppUrl } from "@/lib/appUrl";
import { formatPesoAmount, getOrderPaymentSummary } from "@/lib/paymentSummary";
import { sendResendEmail } from "@/lib/resendEmail";

export const runtime = "nodejs";

const PRIVATE_ASSETS_BUCKET = "private-assets";
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
function jsonError(error, status = 400) {
  return NextResponse.json({ error }, { status });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeMethod(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "")
    .replaceAll(" ", "");
  if (["COD", "CASH", "OFFLINE", "CODOFFLINE"].includes(normalized)) return "COD";
  if (normalized === "EWALLET") return "E-Wallet";
  return null;
}

function getProofPath(reference) {
  const value = String(reference || "");
  const match = value.match(/^private-assets:(payments\/[^/]+\/[^/]+\/[^/]+)$/i);
  return match?.[1] || null;
}

function getOrderRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function getOrderContext(admin, orderId) {
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, business_id, customer_id, status, total, downpayment_amount, balance_amount, confirmed_payment_amount, payment_confirmation_status, payment_confirmed_at, payment_confirmed_by, fully_paid, payment_method, remaining_payment_status, remaining_payment_method, remaining_payment_proof_url, remaining_payment_proof_name, remaining_payment_proof_content_type, remaining_payment_proof_size_bytes, remaining_payment_note, remaining_payment_rejection_reason, remaining_payment_submitted_at, remaining_payment_reviewed_at, remaining_payment_reviewed_by")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return null;

  const [{ data: business, error: businessError }, { data: customer, error: customerError }] = await Promise.all([
    admin.from("businesses").select("id, name, owner_id").eq("id", order.business_id).maybeSingle(),
    order.customer_id
      ? admin.from("profiles").select("id, full_name, email").eq("id", order.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (businessError) throw businessError;
  if (customerError) throw customerError;
  return { order, business, customer };
}

function canAccessOrder(context, user) {
  return Boolean(
    user && context && (
      context.order.customer_id === user.id
      || context.business?.owner_id === user.id
      || user.role === "ADMIN"
    )
  );
}

async function notifyOwner(admin, context, method) {
  const ownerId = context.business?.owner_id;
  if (!ownerId) return "The shop owner could not be identified for notification.";

  const { data: owner, error: ownerError } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", ownerId)
    .maybeSingle();
  if (ownerError) return ownerError.message || "The shop owner could not be notified.";
  if (!owner?.email) return "The shop owner has no email address for payment notifications.";

  const payment = getOrderPaymentSummary(context.order);
  const orderCode = String(context.order.id).split("-")[0].toUpperCase();
  const customerName = context.customer?.full_name || "A customer";
  const orderUrl = getAppUrl("/owner/orders");
  const proofLabel = method === "E-Wallet" ? "payment proof" : "offline payment declaration";
  const result = await sendResendEmail({
    from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
    to: [owner.email],
    subject: `Remaining payment submitted for order #${orderCode}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1a1a1a">
        <h2>Remaining payment needs your review</h2>
        <p>${escapeHtml(customerName)} submitted a ${escapeHtml(proofLabel)} for order <strong>#${escapeHtml(orderCode)}</strong> at ${escapeHtml(context.business?.name || "your shop")}.</p>
        <p><strong>Remaining balance:</strong> ${escapeHtml(formatPesoAmount(payment.balance))}<br><strong>Method:</strong> ${escapeHtml(method)}</p>
        <p><a href="${escapeHtml(orderUrl)}">Open Owner Orders to review it</a></p>
      </div>`,
  });
  return result.error?.message || null;
}

async function claimOwnerNotification(admin, orderId, submittedAt) {
  const eventKey = `remaining-payment-submitted:${orderId}:${submittedAt}`;
  const { error } = await admin.from("order_notification_events").insert({
    order_id: orderId,
    event_key: eventKey,
    event_type: "REMAINING_PAYMENT_SUBMITTED",
    status: "PROCESSING",
  });
  if (!error) return { eventKey, claimed: true };
  if (error.code === "23505") return { eventKey, claimed: false };
  return { eventKey, claimed: false, error };
}

async function finishOwnerNotification(admin, eventKey, warning) {
  await admin
    .from("order_notification_events")
    .update({
      status: warning ? "FAILED" : "SENT",
      last_error: warning,
      sent_at: warning ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("event_key", eventKey);
}

export async function GET(request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.error) return jsonError(auth.error, auth.status);

    const orderId = String(new URL(request.url).searchParams.get("orderId") || "").trim();
    if (!orderId) return jsonError("Missing orderId");

    const context = await getOrderContext(auth.supabase, orderId);
    if (!context) return jsonError("Order not found", 404);
    if (!canAccessOrder(context, { ...auth.user, role: auth.profile.role })) {
      return jsonError("Forbidden", 403);
    }

    const proofReference = context.order.remaining_payment_proof_url;
    if (!proofReference) return NextResponse.json({ proof: null });
    const proofPath = getProofPath(proofReference);
    if (!proofPath) return jsonError("Payment proof storage reference is invalid", 409);

    const { data: signed, error: signedError } = await auth.supabase.storage
      .from(PRIVATE_ASSETS_BUCKET)
      .createSignedUrl(proofPath, 10 * 60);
    if (signedError || !signed?.signedUrl) return jsonError("Payment proof is unavailable", 502);

    return NextResponse.json({
      proof: {
        url: signed.signedUrl,
        name: context.order.remaining_payment_proof_name,
        contentType: context.order.remaining_payment_proof_content_type,
        sizeBytes: context.order.remaining_payment_proof_size_bytes,
      },
    });
  } catch (error) {
    console.error("PAYMENT_PROOF_GET_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return jsonError("Payment proof is temporarily unavailable", 500);
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.error) return jsonError(auth.error, auth.status);
    if (auth.profile.role !== "CUSTOMER") return jsonError("Customer access required", 403);

    let orderId = "";
    let method = null;
    let note = "";
    const body = await request.json().catch(() => ({}));
    orderId = String(body?.orderId || "").trim();
    method = normalizeMethod(body?.method);
    note = String(body?.note || "").trim();

    if (!orderId || !method) return jsonError("Choose a valid order and payment method");
    if (note.length > 500) return jsonError("Payment note must be 500 characters or fewer");

    const context = await getOrderContext(auth.supabase, orderId);
    if (!context) return jsonError("Order not found", 404);
    if (context.order.customer_id !== auth.user.id) return jsonError("Forbidden", 403);

    const payment = getOrderPaymentSummary(context.order);
    if (!payment.isAvailable || !payment.balance || payment.balance <= 0) {
      return jsonError("This order has no remaining balance", 409);
    }
    const selectedMethod = normalizeMethod(context.order.payment_method);
    if (!selectedMethod || method !== selectedMethod) {
      return jsonError("Use the remaining payment method selected at checkout", 409);
    }

    const previousProofPath = getProofPath(context.order.remaining_payment_proof_url);
    let proofReference = null;
    let proofName = null;
    let proofContentType = null;
    let proofSize = null;
    if (method === "E-Wallet") {
      proofReference = String(body?.proofStoragePath || "").trim();
      const proofPath = getProofPath(proofReference);
      const expectedPrefix = `payments/${auth.user.id}/${orderId}/`;
      if (!proofPath || !proofPath.startsWith(expectedPrefix)) {
        return jsonError("Upload your payment proof directly and try again");
      }

      proofContentType = String(body?.proofContentType || "").toLowerCase();
      proofSize = Number(body?.proofSizeBytes || 0);
      proofName = String(body?.proofFileName || "payment-proof").slice(0, 255);
      if (!ALLOWED_PROOF_TYPES.has(proofContentType)) return jsonError("Payment proof must be PNG, JPG, WebP, or PDF");
      if (!Number.isFinite(proofSize) || proofSize <= 0 || proofSize > MAX_PROOF_BYTES) return jsonError("Payment proof must be between 1 byte and 5 MB");
    } else if (body?.proofStoragePath || body?.proofFileName || body?.proofContentType || body?.proofSizeBytes) {
      return jsonError("COD/offline payment does not need a proof file");
    }

    const { data, error: submitError } = await auth.supabase.rpc("customer_submit_remaining_payment", {
      p_order_id: orderId,
      p_method: method,
      p_proof_url: proofReference,
      p_proof_file_name: proofName,
      p_proof_content_type: proofContentType,
      p_proof_size_bytes: proofSize,
      p_note: note || null,
      p_requester_id: auth.user.id,
    });
    if (submitError) throw submitError;

    const updatedOrder = getOrderRow(data);
    if (!updatedOrder?.id) throw new Error("The server did not return the submitted payment state");

    // A rejected proof is replaced, not accumulated. Remove the old private
    // object only after the database has accepted the new reference.
    if (previousProofPath && previousProofPath !== getProofPath(proofReference)) {
      await auth.supabase.storage.from(PRIVATE_ASSETS_BUCKET).remove([previousProofPath]);
    }

    const notificationClaim = await claimOwnerNotification(
      auth.supabase,
      updatedOrder.id,
      updatedOrder.remaining_payment_submitted_at || new Date().toISOString(),
    );
    let notificationWarning = notificationClaim.error?.message || null;
    if (notificationClaim.claimed) {
      notificationWarning = await notifyOwner(auth.supabase, context, method);
      await finishOwnerNotification(auth.supabase, notificationClaim.eventKey, notificationWarning);
    }

    return NextResponse.json({ order: updatedOrder, notificationWarning });
  } catch (error) {
    console.error("PAYMENT_PROOF_POST_ERROR:", error instanceof Error ? error.message : "UnknownError");
    const message = String(error?.message || "");
    if (/already under review|already confirmed|no remaining balance|no longer accepting|initial downpayment/i.test(message)) {
      return jsonError(message, 409);
    }
    if (/schema cache|could not find the function/i.test(message)) {
      return jsonError("The remaining payment workflow is not ready on the server yet. Apply the latest Supabase migration and retry.", 503);
    }
    return jsonError("We could not submit the remaining payment. Please retry.", 500);
  }
}
