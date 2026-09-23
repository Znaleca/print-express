import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];
const REFUND_STATUSES = ["CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_CONFIRMED"];
const STATUS_LABELS = {
  PENDING: "Pending",
  PLACED: "Order placed",
  PREPARING: "In production",
  READY_TO_PICK_UP: "Ready for pickup",
  RIDER_ON_THE_WAY: "In delivery",
  DELIVERY_COMPLETED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
  REFUND_CONFIRMED: "Refund confirmed",
};
const RANGE_DAYS = { today: 1, "7d": 7, "30d": 30 };
const SALES_PERIODS = ["daily", "weekly", "monthly"];
const MAX_ORDER_ROWS = 5000;
const MAX_MESSAGE_ROWS = 200;

function normalizeRange(value) {
  return ["today", "7d", "30d", "all"].includes(value) ? value : "30d";
}

function normalizeSalesPeriod(value) {
  return SALES_PERIODS.includes(value) ? value : "weekly";
}

function getRangeStart(range, now) {
  if (range === "all") return null;
  if (range === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  return new Date(now.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}

function safeDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function parseItems(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCompletionTimestamp(order) {
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  const completionEvent = [...history]
    .reverse()
    .find((event) => COMPLETED_STATUSES.includes(event?.status));
  return completionEvent?.changed_at || order.updated_at || order.created_at;
}

function formatStatus(status) {
  return STATUS_LABELS[status] || String(status || "Unknown").replaceAll("_", " ");
}

function getCustomerName(profileMap, customerId) {
  return profileMap[customerId]?.full_name || "Customer";
}

function getBucketKey(value, granularity) {
  const date = safeDate(value);
  if (!date) return null;
  if (granularity === "month") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatBucketLabel(key, granularity) {
  const date = new Date(`${key}${granularity === "month" ? "-01" : ""}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("en-PH", granularity === "month"
    ? { month: "short", year: "numeric", timeZone: "UTC" }
    : { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function buildOrderTrend(orders, range) {
  const granularity = range === "all" ? "month" : "day";
  const buckets = new Map();
  const getEntry = (value) => {
    const key = getBucketKey(value, granularity);
    if (!key) return null;
    if (!buckets.has(key)) buckets.set(key, {
      key,
      label: formatBucketLabel(key, granularity),
      orders: 0,
      revenue: 0,
      downpayments: 0,
    });
    return buckets.get(key);
  };

  orders.forEach((order) => {
    const orderEntry = getEntry(order.created_at);
    if (orderEntry) {
      orderEntry.orders += 1;
      orderEntry.downpayments += safeNumber(order.downpayment_amount);
    }
    if (COMPLETED_STATUSES.includes(order.status)) {
      const revenueEntry = getEntry(getCompletionTimestamp(order));
      if (revenueEntry) revenueEntry.revenue += safeNumber(order.total);
    }
  });

  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key)).slice(-60);
}

function getWeekKey(value) {
  const date = safeDate(value);
  if (!date) return null;
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function getSalesBucket(buckets, value, period) {
  const key = period === "weekly" ? getWeekKey(value) : getBucketKey(value, period === "monthly" ? "month" : "day");
  if (!key) return null;
  const existing = buckets.get(key) || {
    key,
    label: formatBucketLabel(key, period === "monthly" ? "month" : "day"),
    sales: 0,
    orders: 0,
  };
  buckets.set(key, existing);
  return existing;
}

function buildSalesTrend(orders, period) {
  const buckets = new Map();
  orders
    .filter((order) => COMPLETED_STATUSES.includes(order.status))
    .forEach((order) => {
      const entry = getSalesBucket(buckets, getCompletionTimestamp(order), period);
      if (!entry) return;
      entry.sales += safeNumber(order.total);
      entry.orders += 1;
    });
  const limit = period === "monthly" ? 24 : period === "weekly" ? 12 : 60;
  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key)).slice(-limit);
}

function buildTopItems(orders) {
  const itemMaps = { service: new Map(), product: new Map() };
  orders
    .filter((order) => COMPLETED_STATUSES.includes(order.status))
    .forEach((order) => {
      parseItems(order.items).forEach((item) => {
        const itemType = item?.item_type === "product" ? "product" : "service";
        const fallbackName = itemType === "product" ? "Unnamed product" : "Custom print service";
        const name = String(item?.name || item?.title || fallbackName).trim() || fallbackName;
        const quantity = Math.max(1, safeNumber(item?.quantity) || 1);
        const revenue = Math.max(0, safeNumber(item?.price)) * quantity;
        const itemMap = itemMaps[itemType];
        const entry = itemMap.get(name) || { name, quantity: 0, revenue: 0 };
        entry.quantity += quantity;
        entry.revenue += revenue;
        itemMap.set(name, entry);
      });
    });
  const rank = (items) => [...items.values()].sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue).slice(0, 3);
  return { services: rank(itemMaps.service), products: rank(itemMaps.product) };
}

function buildActionItems({ business, pendingOrders, readyOrders, unreadMessages, pendingMeetings, upcomingMeetings, rejectedDocuments, lowStockServices }) {
  const items = [];
  if (business?.is_open === false) items.push({ key: "closed-shop", title: "Shop is closed", detail: "Open your shop when you are ready to accept new orders.", href: "/owner/shop", tone: "yellow" });
  if (pendingOrders > 0) items.push({ key: "pending-orders", title: `${pendingOrders} new ${pendingOrders === 1 ? "order" : "orders"}`, detail: "Review the latest order requests.", href: "/owner/orders", tone: "yellow" });
  if (readyOrders > 0) items.push({ key: "ready-orders", title: `${readyOrders} ready ${readyOrders === 1 ? "order" : "orders"}`, detail: "Update customers when pickup or delivery is ready.", href: "/owner/orders", tone: "cyan" });
  if (unreadMessages > 0) items.push({ key: "unread-messages", title: `${unreadMessages} unread ${unreadMessages === 1 ? "message" : "messages"}`, detail: "Reply to customers waiting for an answer.", href: "/owner/messages", tone: "magenta" });
  if (pendingMeetings > 0) items.push({ key: "meeting-requests", title: `${pendingMeetings} meeting ${pendingMeetings === 1 ? "request" : "requests"}`, detail: "Choose a time or respond to the customer.", href: "/owner/messages", tone: "magenta" });
  if (upcomingMeetings > 0) items.push({ key: "upcoming-meetings", title: `${upcomingMeetings} upcoming ${upcomingMeetings === 1 ? "meeting" : "meetings"}`, detail: "Open your calendar to prepare for the next call.", href: "/owner/calendar", tone: "cyan" });
  if (rejectedDocuments > 0) items.push({ key: "verification-documents", title: `${rejectedDocuments} document ${rejectedDocuments === 1 ? "needs" : "need"} attention`, detail: "Review admin feedback and submit a replacement.", href: "/owner/documents", tone: "magenta" });
  if (lowStockServices > 0) items.push({ key: "low-stock", title: `${lowStockServices} low-stock ${lowStockServices === 1 ? "catalog item" : "catalog items"}`, detail: "Check quantity or capacity before accepting more requests.", href: "/owner/services", tone: "yellow" });
  return items.slice(0, 8);
}

export async function GET(request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.profile.role !== "BUSINESS_OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const range = normalizeRange(params.get("range"));
    const salesPeriod = normalizeSalesPeriod(params.get("salesPeriod"));
    const now = new Date();
    const rangeStart = getRangeStart(range, now);
    const { data: business, error: businessError } = await auth.supabase
      .from("businesses")
      .select("id, name, description, is_open, status, lifecycle_state, timezone, updated_at")
      .eq("owner_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) {
      return NextResponse.json({ business: null, range: { key: range, start: rangeStart?.toISOString() || null, end: now.toISOString(), salesPeriod }, kpis: null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const ordersRequest = auth.supabase
      .from("orders")
      .select("id, status, total, downpayment_amount, balance_amount, fully_paid, payment_method, delivery_type, created_at, updated_at, items, rating, feedback_hidden", { count: "exact" })
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .range(0, MAX_ORDER_ROWS - 1);
    if (rangeStart) ordersRequest.gte("created_at", rangeStart.toISOString());

    const [ordersResult, servicesResult, conversationsResult, callsResult, documentsResult] = await Promise.all([
      ordersRequest,
      auth.supabase.from("services").select("id, name, available, item_type, stock_qty, low_stock_threshold").eq("business_id", business.id).order("updated_at", { ascending: false }).limit(1000),
      auth.supabase.from("chat_conversations").select("id, customer_id, updated_at, created_at").eq("business_id", business.id).order("updated_at", { ascending: false }).range(0, 999),
      auth.supabase.from("video_calls").select("id, conversation_id, customer_id, status, scheduled_at, requested_slot_at, created_at").eq("business_id", business.id).in("status", ["REQUESTED", "SCHEDULED", "LIVE"]).order("scheduled_at", { ascending: true }).range(0, 99),
      auth.supabase.from("business_documents").select("doc_type, status").eq("business_id", business.id),
    ]);
    const firstError = [ordersResult, servicesResult, conversationsResult, callsResult, documentsResult].find((result) => result.error)?.error;
    if (firstError) throw firstError;

    const orders = ordersResult.data || [];
    const services = servicesResult.data || [];
    const conversations = conversationsResult.data || [];
    const calls = callsResult.data || [];
    const documents = documentsResult.data || [];
    const conversationIds = conversations.map((conversation) => conversation.id).filter(Boolean);
    const unreadResult = conversationIds.length
      ? await auth.supabase.from("chat_messages").select("id", { count: "exact", head: true }).in("conversation_id", conversationIds).eq("is_read", false).neq("sender_id", auth.user.id)
      : { count: 0, error: null };
    if (unreadResult.error) throw unreadResult.error;
    const messageRowsResult = conversationIds.length
      ? await auth.supabase.from("chat_messages").select("id, conversation_id, sender_id, created_at, is_read, message_type").in("conversation_id", conversationIds).order("created_at", { ascending: false }).range(0, MAX_MESSAGE_ROWS - 1)
      : { data: [], error: null };
    if (messageRowsResult.error) throw messageRowsResult.error;
    const messageRows = messageRowsResult.data || [];
    const customerIds = [...new Set([
      ...conversations.map((conversation) => conversation.customer_id),
      ...calls.map((call) => call.customer_id),
    ].filter(Boolean))];
    const profilesResult = customerIds.length
      ? await auth.supabase.from("profiles").select("id, full_name").in("id", customerIds)
      : { data: [], error: null };
    if (profilesResult.error) throw profilesResult.error;
    const profileMap = Object.fromEntries((profilesResult.data || []).map((profile) => [profile.id, profile]));
    const conversationMap = Object.fromEntries(conversations.map((conversation) => [conversation.id, conversation]));

    const completedOrders = orders.filter((order) => COMPLETED_STATUSES.includes(order.status));
    const refundOrders = orders.filter((order) => REFUND_STATUSES.includes(order.status));
    const pendingOrders = orders.filter((order) => order.status === "PENDING").length;
    const inProduction = orders.filter((order) => order.status === "PREPARING").length;
    const readyOrders = orders.filter((order) => ["READY_TO_PICK_UP", "RIDER_ON_THE_WAY"].includes(order.status)).length;
    const revenue = completedOrders.reduce((sum, order) => sum + safeNumber(order.total), 0);
    const downpayments = orders.reduce((sum, order) => sum + safeNumber(order.downpayment_amount), 0);
    const outstanding = orders.filter((order) => !REFUND_STATUSES.includes(order.status)).reduce((sum, order) => sum + Math.max(0, safeNumber(order.balance_amount)), 0);
    const visibleReviews = completedOrders.filter((order) => order.rating != null && !order.feedback_hidden);
    const averageRating = visibleReviews.length ? Number((visibleReviews.reduce((sum, order) => sum + safeNumber(order.rating), 0) / visibleReviews.length).toFixed(1)) : null;
    const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: visibleReviews.filter((order) => Number(order.rating) === rating).length }));
    const activeServices = services.filter((service) => service.available !== false).length;
    const lowStockServices = services.filter((service) => (service.item_type === "product" || safeNumber(service.stock_qty) > 0) && safeNumber(service.stock_qty) <= safeNumber(service.low_stock_threshold || 10)).length;
    const pendingMeetings = calls.filter((call) => call.status === "REQUESTED").length;
    const upcomingMeetings = calls.filter((call) => ["SCHEDULED", "LIVE"].includes(call.status) && safeDate(call.scheduled_at)?.getTime() >= now.getTime()).length;
    const rejectedDocuments = documents.filter((document) => ["REJECTED", "NEEDS_CHANGES", "ACTION_REQUIRED"].includes(String(document.status || "").toUpperCase())).length;
    const recentMessages = messageRows
      .filter((message) => message.conversation_id)
      .reduce((latest, message) => {
        if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message);
        return latest;
      }, new Map());
    const topItems = buildTopItems(orders);

    return NextResponse.json({
      business,
      range: { key: range, start: rangeStart?.toISOString() || null, end: now.toISOString(), salesPeriod, orderRowsLimited: ordersResult.count > orders.length },
      kpis: {
        totalOrders: ordersResult.count ?? orders.length,
        newOrders: pendingOrders,
        inProduction,
        readyOrders,
        completedOrders: completedOrders.length,
        revenue,
        downpayments,
        outstanding,
        refundOrders: refundOrders.length,
        unreadMessages: unreadResult.count || 0,
        upcomingMeetings,
        averageRating,
        reviewCount: visibleReviews.length,
        activeServices,
        lowStockServices,
      },
      orderTrend: buildOrderTrend(orders, range),
      salesTrend: buildSalesTrend(orders, salesPeriod),
      weeklySales: buildSalesTrend(orders, "weekly"),
      statusBreakdown: Object.entries(orders.reduce((counts, order) => ({ ...counts, [order.status]: (counts[order.status] || 0) + 1 }), {})).map(([status, count]) => ({ status, label: formatStatus(status), count })),
      fulfillmentBreakdown: ["PICKUP", "DELIVERY"].map((type) => ({ type, label: type === "DELIVERY" ? "Delivery" : "Store pickup", count: orders.filter((order) => (order.delivery_type || "PICKUP") === type).length })),
      ratingDistribution,
      topServices: topItems.services,
      topProducts: topItems.products,
      actionItems: buildActionItems({ business, pendingOrders, readyOrders, unreadMessages: unreadResult.count || 0, pendingMeetings, upcomingMeetings, rejectedDocuments, lowStockServices }),
      recentOrders: orders.slice(0, 5).map((order) => ({ id: order.id, status: order.status, statusLabel: formatStatus(order.status), total: safeNumber(order.total), createdAt: order.created_at, deliveryType: order.delivery_type || "PICKUP" })),
      recentMessages: [...recentMessages.values()].slice(0, 5).map((message) => {
        const conversation = conversationMap[message.conversation_id];
        return { conversationId: message.conversation_id, customerName: getCustomerName(profileMap, conversation?.customer_id), createdAt: message.created_at, unread: message.is_read === false && message.sender_id !== auth.user.id, messageType: message.message_type || "text" };
      }),
      recentReviews: visibleReviews.slice(0, 5).map((order) => ({ orderId: order.id, rating: Number(order.rating), createdAt: order.updated_at || order.created_at })),
      upcomingMeetingList: calls.filter((call) => ["REQUESTED", "SCHEDULED", "LIVE"].includes(call.status)).slice(0, 5).map((call) => ({ id: call.id, conversationId: call.conversation_id, customerName: getCustomerName(profileMap, call.customer_id), status: call.status, scheduledAt: call.scheduled_at || call.requested_slot_at, createdAt: call.created_at })),
      recentPayments: orders.filter((order) => safeNumber(order.downpayment_amount) > 0 || order.fully_paid).slice(0, 5).map((order) => ({ id: order.id, amount: order.fully_paid ? safeNumber(order.total) : safeNumber(order.downpayment_amount), label: order.fully_paid ? "Paid in full" : "Downpayment received", method: order.payment_method, createdAt: order.updated_at || order.created_at })),
      _meta: { generatedAt: now.toISOString(), source: "owner-scoped dashboard queries" },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("OWNER_DASHBOARD_LOAD_ERROR:", JSON.stringify({
      name: error instanceof Error ? error.name : "UnknownError",
      code: error?.code || null,
      message: error?.message || null,
      hint: error?.hint || null,
    }));
    return NextResponse.json({ error: "OWNER_DASHBOARD_UNAVAILABLE" }, { status: 503 });
  }
}
