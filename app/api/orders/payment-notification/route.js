import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { normalizePhilippinePhone } from "@/lib/phone";
import { getAppUrl, getConfiguredAppUrl } from "@/lib/appUrl";
import { formatPesoAmount, getOrderPaymentSummary } from "@/lib/paymentSummary";
import { sendResendEmail } from "@/lib/resendEmail";

const NOTIFICATION_TYPES = new Set(["BALANCE_DUE", "COMPLETION"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getOrderCode(order) {
  return String(order?.id || "").split("-")[0].toUpperCase();
}

function buildNotificationCopy({ type, order, business, customer, payment, appUrl }) {
  const orderCode = getOrderCode(order);
  const shopName = business?.name || "your print shop";
  const customerName = customer?.full_name || "there";
  const total = formatPesoAmount(payment.total);
  const confirmed = formatPesoAmount(payment.confirmedAmount);
  const balance = formatPesoAmount(payment.balance);
  const trackUrl = appUrl ? getAppUrl(`/track?order=${encodeURIComponent(order.id)}`) : null;
  const reviewUrl = appUrl ? getAppUrl(`/track?review=${encodeURIComponent(order.id)}#review-${encodeURIComponent(order.id)}`) : null;

  if (type === "BALANCE_DUE") {
    return {
      subject: `Payment reminder for order #${orderCode}`,
      sms: `Press & Present: Hi ${customerName}, order #${orderCode} at ${shopName} still has a remaining balance of ${balance}. Total: ${total}. Paid/confirmed: ${confirmed}. Please contact the shop to complete payment before final completion.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1a1a1a">
          <h2>Payment reminder for order #${escapeHtml(orderCode)}</h2>
          <p>Hi ${escapeHtml(customerName)}, your order at <strong>${escapeHtml(shopName)}</strong> still has a balance that must be paid before the shop can mark it complete.</p>
          <p><strong>Total:</strong> ${escapeHtml(total)}<br><strong>Confirmed paid:</strong> ${escapeHtml(confirmed)}<br><strong>Remaining balance:</strong> ${escapeHtml(balance)}</p>
          ${trackUrl ? `<p><a href="${escapeHtml(trackUrl)}">View your order</a></p>` : ""}
        </div>`,
      trackUrl,
    };
  }

  return {
    subject: `Order #${orderCode} is complete — thank you`,
    sms: order.status === "DELIVERY_COMPLETED"
      ? `Press & Present: Order #${orderCode} has been delivered and completed by ${shopName}. Thank you for ordering.`
      : `Press & Present: Order #${orderCode} is COMPLETED. Thank you for ordering from ${shopName}.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1a1a1a">
        <h2>Thank you for your order</h2>
        <p>Hi ${escapeHtml(customerName)}, your order #${escapeHtml(orderCode)} from <strong>${escapeHtml(shopName)}</strong> has been completed.</p>
        <p>Thank you for your payment and support. We appreciate your business.</p>
        ${reviewUrl ? `<p><a href="${escapeHtml(reviewUrl)}">Review this service or product</a></p>` : ""}
      </div>`,
    trackUrl,
  };
}

async function claimNotificationEvent(admin, eventKey, orderId, eventType) {
  const { data: existing, error: existingError } = await admin
    .from("order_notification_events")
    .select("id, status, updated_at")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existingError) return { available: false, error: existingError };
  if (existing?.status === "SENT") return { available: true, duplicate: true };

  const staleBefore = Date.now() - 10 * 60 * 1000;
  const isStale = existing?.status === "PROCESSING"
    && new Date(existing.updated_at || 0).getTime() < staleBefore;

  if (existing && existing.status === "PROCESSING" && !isStale) {
    return { available: true, duplicate: true };
  }

  if (existing) {
    const { data: claimed, error } = await admin
      .from("order_notification_events")
      .update({ status: "PROCESSING", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("status", existing.status)
      .eq("updated_at", existing.updated_at)
      .select("id")
      .maybeSingle();
    if (error) return { available: false, error };
    return claimed ? { available: true } : { available: true, duplicate: true };
  }

  const { error: insertError } = await admin.from("order_notification_events").insert({
    order_id: orderId,
    event_key: eventKey,
    event_type: eventType,
    status: "PROCESSING",
  });

  if (!insertError) return { available: true };
  if (insertError.code !== "23505") return { available: false, error: insertError };

  const { data: raced } = await admin
    .from("order_notification_events")
    .select("status")
    .eq("event_key", eventKey)
    .maybeSingle();
  return { available: true, duplicate: Boolean(raced && ["SENT", "PROCESSING"].includes(raced.status)) };
}

async function updateNotificationEvent(admin, eventKey, status, lastError = null) {
  const { error } = await admin
    .from("order_notification_events")
    .update({
      status,
      sent_at: status === "SENT" ? new Date().toISOString() : null,
      last_error: lastError,
      updated_at: new Date().toISOString(),
    })
    .eq("event_key", eventKey);
  if (error) console.warn("[Payment notification] Could not update event:", error.message);
}

async function sendSms(admin, { orderId, phone, message }) {
  if (!phone) return { sent: false, warning: "The customer has no valid phone number." };

  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) return { sent: false, warning: "SMS service is not configured." };

  const { data: existing } = await admin
    .from("sms_notification_logs")
    .select("id")
    .eq("order_id", orderId)
    .eq("message_content", message)
    .eq("status", "SENT")
    .limit(1)
    .maybeSingle();
  if (existing) return { sent: true, duplicate: true };

  const formData = new URLSearchParams({ apikey: apiKey, number: phone.replace(/^\+/, ""), message });
  if (process.env.SEMAPHORE_SENDER_NAME) formData.set("sendername", process.env.SEMAPHORE_SENDER_NAME);

  try {
    const response = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });
    const responseText = await response.text();
    let providerResponse = responseText;
    try { providerResponse = JSON.parse(responseText); } catch {}

    await admin.from("sms_notification_logs").insert({
      recipient_phone: phone,
      message_content: message,
      status: response.ok ? "SENT" : "FAILED",
      provider: "Semaphore",
      order_id: orderId,
      provider_response: providerResponse,
    });

    return response.ok
      ? { sent: true }
      : { sent: false, warning: "SMS delivery failed." };
  } catch {
    return { sent: false, warning: "SMS service is temporarily unavailable." };
  }
}

async function sendEmail({ email, copy }) {
  if (!email) return { sent: false, warning: "The customer has no email address." };
  if (!getConfiguredAppUrl()) return { sent: false, warning: "Email links are not configured." };

  const result = await sendResendEmail({
    from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
    to: [email],
    subject: copy.subject,
    html: copy.html,
  });
  return result.error
    ? { sent: false, warning: result.error.message || "Email delivery failed." }
    : { sent: true };
}

export async function POST(request) {
  let admin;
  try {
    admin = getSupabaseAdminClient();
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const body = await request.json();
    const orderId = String(body?.orderId || "").trim();
    const type = String(body?.type || "").trim().toUpperCase();

    if (!token || !orderId || !NOTIFICATION_TYPES.has(type)) {
      return NextResponse.json({ error: "Missing token, orderId, or notification type" }, { status: 400 });
    }

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, business_id, customer_id, status, customer_phone, total, downpayment_amount, balance_amount, fully_paid, confirmed_payment_amount, payment_confirmation_status, receipt_url")
      .eq("id", orderId)
      .single();
    if (orderError || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id, name, owner_id")
      .eq("id", order.business_id)
      .single();
    if (businessError || !business || business.owner_id !== userData.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: customer } = order.customer_id
      ? await admin.from("profiles").select("id, full_name, email, phone").eq("id", order.customer_id).maybeSingle()
      : { data: null };
    const payment = getOrderPaymentSummary(order);

    if (type === "BALANCE_DUE" && (!payment.isAvailable || !payment.balance || payment.balance <= 0)) {
      return NextResponse.json({ skipped: true, reason: "This order has no remaining balance." });
    }
    if (type === "COMPLETION" && !["COMPLETED", "DELIVERY_COMPLETED"].includes(order.status)) {
      return NextResponse.json({ skipped: true, reason: "The order is not complete yet." });
    }

    const eventKey = `payment:${type}:${order.id}:${order.status}:${Number(payment.confirmedAmount || 0).toFixed(2)}`;
    const claim = await claimNotificationEvent(admin, eventKey, order.id, type);
    if (!claim.available) {
      console.error("[Payment notification] Notification idempotency is unavailable:", claim.error?.message || "unknown error");
      return NextResponse.json({ error: "Payment notification retry protection is unavailable. Apply the latest Supabase migration and retry." }, { status: 503 });
    }
    if (claim.duplicate) return NextResponse.json({ skipped: true, reason: "This customer notification was already sent or is being sent." });

    const phone = normalizePhilippinePhone(order.customer_phone || customer?.phone);
    const copy = buildNotificationCopy({ type, order, business, customer, payment, appUrl: getConfiguredAppUrl() });
    const [smsResult, emailResult] = await Promise.all([
      sendSms(admin, { orderId: order.id, phone, message: copy.sms }),
      sendEmail({ email: customer?.email, copy }),
    ]);
    const warnings = [smsResult.warning, emailResult.warning].filter(Boolean);
    const channelsSent = Number(smsResult.sent) + Number(emailResult.sent);

    if (claim.available) {
      await updateNotificationEvent(
        admin,
        eventKey,
        channelsSent > 0 ? "SENT" : warnings.length ? "FAILED" : "SKIPPED",
        warnings.length ? warnings.join(" ") : null,
      );
    }

    if (!channelsSent) {
      return NextResponse.json({ skipped: true, reason: warnings.join(" ") || "No customer notification channel is available." });
    }
    return NextResponse.json({ sent: { sms: smsResult.sent, email: emailResult.sent }, warning: warnings.join(" ") || null });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed to send payment notification" }, { status: 500 });
  }
}
