import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { normalizePhilippinePhone } from "@/lib/phone";

const SMS_STATUS_LABELS = {
  PLACED: "PLACED",
  PREPARING: "PREPARING",
  READY_TO_PICK_UP: "READY",
  RIDER_ON_THE_WAY: "DELIVERY",
  DELIVERY_COMPLETED: "DELIVERY_COMPLETED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

const buildSmsMessage = ({ statusLabel, order, business }) => {
  const orderCode = order.id.split("-")[0].toUpperCase();
  const shopName = business?.name || "your print shop";

  if (statusLabel === "PLACED") {
    return `Press & Present: Order #${orderCode} has been PLACED at ${shopName}. We will notify you when production starts.`;
  }

  if (statusLabel === "PREPARING") {
    return `Press & Present: Order #${orderCode} is now PREPARING at ${shopName}. We will notify you when it is ready.`;
  }

  if (statusLabel === "READY") {
    return `Press & Present: Order #${orderCode} is READY FOR PICKUP at ${shopName}. Please prepare your balance/payment if applicable.`;
  }

  if (statusLabel === "DELIVERY") {
    return `Press & Present: Order #${orderCode} is OUT FOR DELIVERY from ${shopName}.`;
  }

  if (statusLabel === "CANCELLED") {
    return `Press & Present: Order #${orderCode} has been CANCELLED by ${shopName}. Please contact the shop for details.`;
  }

  if (statusLabel === "DELIVERY_COMPLETED") {
    return `Press & Present: Order #${orderCode} has been delivered and completed by ${shopName}. Thank you for ordering.`;
  }

  return `Press & Present: Order #${orderCode} is COMPLETED. Thank you for ordering from ${shopName}.`;
};

async function logSms(supabase, payload) {
  const { error } = await supabase.from("sms_notification_logs").insert({
    recipient_phone: payload.recipientPhone || "UNAVAILABLE",
    message_content: payload.messageContent,
    status: payload.status,
    provider: "Semaphore",
    order_id: payload.orderId || null,
    provider_response: payload.providerResponse || null,
  });

  if (error) {
    console.warn("[SMS] Could not write SMS log:", error.message);
  }
}

export async function POST(request) {
  const supabase = getSupabaseAdminClient();

  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { orderId, status } = await request.json();

    if (!token || !orderId || !status) {
      return NextResponse.json({ error: "Missing token, orderId, or status" }, { status: 400 });
    }

    const statusLabel = SMS_STATUS_LABELS[status];
    if (!statusLabel) {
      return NextResponse.json({ skipped: true, reason: "Status does not require SMS" });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, business_id, status, customer_phone, total, balance_amount")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, owner_id")
      .eq("id", order.business_id)
      .single();

    if (businessError || !business || business.owner_id !== userData.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (order.status !== status) {
      return NextResponse.json({ skipped: true, reason: "Order status has changed; refresh before sending an update." }, { status: 409 });
    }

    const recipientPhone = normalizePhilippinePhone(order.customer_phone);
    const messageContent = buildSmsMessage({ statusLabel, order, business });

    if (!recipientPhone) {
      await logSms(supabase, {
        recipientPhone,
        messageContent,
        status: "SKIPPED_NO_PHONE",
        orderId,
      });
      return NextResponse.json({ skipped: true, reason: "Order has no customer phone number" });
    }

    // Do not send duplicate provider requests when a realtime update, retry,
    // or double-click invokes this endpoint more than once.
    const { data: existingLog } = await supabase
      .from("sms_notification_logs")
      .select("id")
      .eq("order_id", orderId)
      .eq("message_content", messageContent)
      .eq("status", "SENT")
      .limit(1)
      .maybeSingle();
    if (existingLog) {
      return NextResponse.json({ skipped: true, reason: "This status update was already sent." });
    }

    const apiKey = process.env.SEMAPHORE_API_KEY;
    if (!apiKey) {
      await logSms(supabase, {
        recipientPhone,
        messageContent,
        status: "SKIPPED_NO_API_KEY",
        orderId,
      });
      return NextResponse.json({ skipped: true, reason: "Semaphore API key is not configured" });
    }

    const formData = new URLSearchParams({
      apikey: apiKey,
      number: recipientPhone.replace(/^\+/, ""),
      message: messageContent,
    });

    if (process.env.SEMAPHORE_SENDER_NAME) {
      formData.set("sendername", process.env.SEMAPHORE_SENDER_NAME);
    }

    const semaphoreResponse = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    const responseText = await semaphoreResponse.text();
    let providerResponse = responseText;
    try {
      providerResponse = JSON.parse(responseText);
    } catch (_) {}

    await logSms(supabase, {
      recipientPhone,
      messageContent,
      status: semaphoreResponse.ok ? "SENT" : "FAILED",
      orderId,
      providerResponse,
    });

    if (!semaphoreResponse.ok) {
      return NextResponse.json({ error: "Semaphore send failed", providerResponse }, { status: 502 });
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to send SMS" }, { status: 500 });
  }
}
