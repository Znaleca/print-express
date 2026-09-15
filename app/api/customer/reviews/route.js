import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];

function purchasedItems(order) {
  const seen = new Set();
  return (Array.isArray(order.items) ? order.items : [])
    .filter((item) => item?.id && item?.name && !seen.has(item.id) && seen.add(item.id))
    .map((item) => ({
      service_id: item.id,
      name: item.name,
      quantity: Number(item.quantity) || 1,
      item_type: item.item_type || (item.isProduct ? "product" : "service"),
      image_url: item.image_url || null,
    }));
}

export async function GET(request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.profile.role !== "CUSTOMER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: orders, error: orderError } = await auth.supabase
      .from("orders")
      .select("id, business_id, status, items, rating, feedback_masked, feedback_hidden, review_service_id, created_at, businesses(name)")
      .eq("customer_id", auth.user.id)
      .order("created_at", { ascending: false })
      .range(0, 9999);
    if (orderError) throw orderError;

    const orderIds = (orders || []).map((order) => order.id);
    const { data: itemReviews, error: reviewError } = orderIds.length
      ? await auth.supabase
        .from("order_item_reviews")
        .select("id, order_id, service_id, item_name, item_type, rating, feedback_masked, feedback_hidden, created_at, updated_at")
        .eq("customer_id", auth.user.id)
        .in("order_id", orderIds)
      : { data: [], error: null };
    if (reviewError) throw reviewError;

    const reviewByItem = new Map((itemReviews || []).map((review) => [`${review.order_id}:${review.service_id}`, review]));
    const history = (orders || []).map((order) => ({
      order_id: order.id,
      business_id: order.business_id,
      shop_name: order.businesses?.name || "Print shop",
      status: order.status,
      ordered_at: order.created_at,
      reviewable: COMPLETED_STATUSES.includes(order.status),
      items: purchasedItems(order).map((item) => {
        const itemReview = reviewByItem.get(`${order.id}:${item.service_id}`);
        const legacyReview = !itemReview && order.review_service_id === item.service_id && order.rating != null
          ? {
            id: null,
            rating: Number(order.rating),
            feedback_masked: order.feedback_masked || "",
            feedback_hidden: Boolean(order.feedback_hidden),
            legacy: true,
          }
          : null;
        return { ...item, review: itemReview || legacyReview };
      }),
    }));

    return NextResponse.json({ orders: history }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("CUSTOMER_REVIEW_HISTORY_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "CUSTOMER_REVIEW_HISTORY_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.profile.role !== "CUSTOMER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId || "").trim();
    const serviceId = String(body.serviceId || "").trim();
    const rating = Number(body.rating);
    const feedback = String(body.feedback || "").trim().slice(0, 2000);
    if (!orderId || !serviceId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Choose an item and a rating from 1 to 5." }, { status: 400 });
    }

    const { data: order, error: orderError } = await auth.supabase
      .from("orders")
      .select("id, business_id, customer_id, status, items, rating, review_service_id")
      .eq("id", orderId)
      .eq("customer_id", auth.user.id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || !COMPLETED_STATUSES.includes(order.status)) {
      return NextResponse.json({ error: "Only completed purchases can be reviewed." }, { status: 409 });
    }

    const item = purchasedItems(order).find((candidate) => candidate.service_id === serviceId);
    if (!item) return NextResponse.json({ error: "This item was not part of the order." }, { status: 400 });

    if (order.review_service_id === serviceId && order.rating != null) {
      const { data, error } = await auth.supabase
        .from("orders")
        .update({ rating, feedback })
        .eq("id", order.id)
        .eq("customer_id", auth.user.id)
        .select("id, rating, feedback_masked, feedback_hidden, review_service_id")
        .single();
      if (error) throw error;
      return NextResponse.json({ review: { ...data, legacy: true } });
    }

    const { data: service, error: serviceError } = await auth.supabase
      .from("services")
      .select("id, item_type")
      .eq("id", serviceId)
      .eq("business_id", order.business_id)
      .maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) return NextResponse.json({ error: "The purchased catalog item is no longer available for review." }, { status: 409 });

    const { data, error } = await auth.supabase
      .from("order_item_reviews")
      .upsert({
        order_id: order.id,
        business_id: order.business_id,
        customer_id: auth.user.id,
        service_id: serviceId,
        item_name: item.name,
        item_type: service.item_type,
        rating,
        feedback,
      }, { onConflict: "order_id,service_id" })
      .select("id, order_id, service_id, item_name, item_type, rating, feedback_masked, feedback_hidden, created_at, updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ review: data });
  } catch (error) {
    console.error("CUSTOMER_ITEM_REVIEW_SAVE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "CUSTOMER_ITEM_REVIEW_SAVE_FAILED" }, { status: 500 });
  }
}
