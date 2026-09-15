import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];

function toReview(row, profileMap) {
  return {
    review_id: null,
    order_id: row.id,
    business_id: row.business_id,
    rating: Number(row.rating),
    // Owners receive the masked projection. The original text stays Admin-only.
    feedback: row.feedback_masked || "",
    feedback_hidden: Boolean(row.feedback_hidden),
    feedback_hidden_at: row.feedback_hidden_at,
    feedback_hidden_by: row.feedback_hidden_by,
    created_at: row.created_at,
    customer_name: profileMap[row.customer_id]?.full_name || "Verified Customer",
    item_name: null,
    review_service_id: row.review_service_id || null,
  };
}

async function getOwnerBusiness(supabase, ownerId) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getReviewPayload(supabase, ownerId) {
  const business = await getOwnerBusiness(supabase, ownerId);
  if (!business) {
    return {
      business: null,
      reviews: [],
      hiddenReviews: [],
      summary: { total: 0, visible: 0, hidden: 0, averageRating: null, overallAverageRating: null },
    };
  }

  const { data: orderRows, error: orderError } = await supabase
    .from("orders")
    .select("id, business_id, customer_id, status, rating, feedback_masked, feedback_hidden, feedback_hidden_at, feedback_hidden_by, created_at, items, review_service_id")
    .eq("business_id", business.id)
    .in("status", COMPLETED_STATUSES)
    .not("rating", "is", null)
    .order("created_at", { ascending: false })
    .range(0, 9999);
  if (orderError) throw orderError;

  const rows = orderRows || [];
  const { data: itemReviewRows, error: itemReviewError } = await supabase
    .from("order_item_reviews")
    .select("id, order_id, business_id, customer_id, service_id, item_name, item_type, rating, feedback_masked, feedback_hidden, feedback_hidden_at, feedback_hidden_by, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .range(0, 9999);
  if (itemReviewError) throw itemReviewError;
  const customerIds = [...new Set([...rows, ...(itemReviewRows || [])].map((row) => row.customer_id).filter(Boolean))];
  const { data: profiles, error: profilesError } = customerIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", customerIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;

  const profileMap = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
  const reviews = rows.map((row) => toReview(row, profileMap));
  const { data: requestRows, error: requestError } = await supabase
      .from("review_moderation_requests")
      .select("id, order_id, business_id, review_id, reason, status, admin_response, reviewed_by, reviewed_at, created_at, updated_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });
  if (requestError) throw requestError;
  const requestsByOrder = {};
  const requestsByReview = {};
  (requestRows || []).forEach((request) => {
    if (!requestsByOrder[request.order_id]) requestsByOrder[request.order_id] = [];
    requestsByOrder[request.order_id].push(request);
    if (request.review_id) {
      if (!requestsByReview[request.review_id]) requestsByReview[request.review_id] = [];
      requestsByReview[request.review_id].push(request);
    }
  });
  const serviceIds = [...new Set([...rows.map((row) => row.review_service_id), ...(itemReviewRows || []).map((row) => row.service_id)].filter(Boolean))];
  const { data: services, error: servicesError } = serviceIds.length > 0
    ? await supabase.from("services").select("id, name, item_type").in("id", serviceIds).eq("business_id", business.id)
    : { data: [], error: null };
  if (servicesError) throw servicesError;
  const serviceMap = Object.fromEntries((services || []).map((service) => [service.id, service]));
  const ratingSummaries = {};
  rows.forEach((row) => {
    if (!row.review_service_id || !serviceMap[row.review_service_id]) return;
    const key = row.review_service_id;
    const current = ratingSummaries[key] || { serviceId: key, name: serviceMap[key].name, itemType: serviceMap[key].item_type, total: 0, visible: 0, hidden: 0, ratingTotal: 0 };
    current.total += 1;
    current.ratingTotal += Number(row.rating) || 0;
    if (row.feedback_hidden) current.hidden += 1;
    else current.visible += 1;
    ratingSummaries[key] = current;
  });
  (itemReviewRows || []).forEach((row) => {
    const key = row.service_id;
    const service = serviceMap[key];
    if (!key || !service) return;
    const current = ratingSummaries[key] || { serviceId: key, name: service.name, itemType: service.item_type, total: 0, visible: 0, hidden: 0, ratingTotal: 0 };
    current.total += 1;
    current.ratingTotal += Number(row.rating) || 0;
    if (row.feedback_hidden) current.hidden += 1;
    else current.visible += 1;
    ratingSummaries[key] = current;
  });
  Object.values(ratingSummaries).forEach((summary) => {
    summary.averageRating = summary.visible > 0 ? Number((summary.ratingTotal / summary.visible).toFixed(1)) : null;
    delete summary.ratingTotal;
  });
  const itemReviews = (itemReviewRows || []).map((review) => ({
    review_id: review.id,
    order_id: review.order_id,
    business_id: review.business_id,
    rating: Number(review.rating),
    feedback: review.feedback_masked || "",
    feedback_hidden: Boolean(review.feedback_hidden),
    feedback_hidden_at: review.feedback_hidden_at,
    feedback_hidden_by: review.feedback_hidden_by,
    created_at: review.created_at,
    customer_name: profileMap[review.customer_id]?.full_name || "Verified Customer",
    item_name: review.item_name,
    review_service_id: review.service_id,
    review_target_name: review.item_name,
    review_target_type: review.item_type,
  }));
  const decoratedReviews = [...reviews.map((review) => ({
    ...review,
    item_name: serviceMap[review.review_service_id]?.name || null,
    review_target_name: serviceMap[review.review_service_id]?.name || null,
    review_target_type: serviceMap[review.review_service_id]?.item_type || null,
  })), ...itemReviews];
  const visibleDecoratedReviews = decoratedReviews.filter((review) => !review.feedback_hidden);
  const hiddenDecoratedReviews = decoratedReviews.filter((review) => review.feedback_hidden);
  const sum = (items) => items.reduce((total, review) => total + Number(review.rating || 0), 0);
  const average = (items) => items.length > 0 ? Number((sum(items) / items.length).toFixed(1)) : null;

  return {
    business,
    reviews: visibleDecoratedReviews.map((review) => ({ ...review, moderationRequests: review.review_id ? requestsByReview[review.review_id] || [] : requestsByOrder[review.order_id] || [] })),
    hiddenReviews: hiddenDecoratedReviews.map((review) => ({ ...review, moderationRequests: review.review_id ? requestsByReview[review.review_id] || [] : requestsByOrder[review.order_id] || [] })),
    moderationRequests: requestRows || [],
    ratingSummaries: Object.values(ratingSummaries),
    summary: {
      total: decoratedReviews.length,
      visible: visibleDecoratedReviews.length,
      hidden: hiddenDecoratedReviews.length,
      // Shop-facing ratings exclude reviews hidden by the owner/admin.
      averageRating: average(visibleDecoratedReviews),
      overallAverageRating: average(decoratedReviews),
      pendingRemovalRequests: (requestRows || []).filter((request) => request.status === "PENDING").length,
    },
  };
}

export async function GET(request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.profile.role !== "BUSINESS_OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(await getReviewPayload(auth.supabase, auth.user.id), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("OWNER_REVIEWS_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "OWNER_REVIEWS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.profile.role !== "BUSINESS_OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId || "").trim();
    const reviewId = String(body.reviewId || "").trim();
    const reason = String(body.reason || "").trim();
    if ((!orderId && !reviewId) || reason.length < 5 || reason.length > 1000) {
      return NextResponse.json({ error: "A reason of 5 to 1000 characters is required." }, { status: 400 });
    }

    const { data, error } = reviewId
      ? await auth.supabase.rpc("request_item_review_removal", { p_review_id: reviewId, p_reason: reason, p_requester_id: auth.user.id })
      : await auth.supabase.rpc("request_review_removal", { p_order_id: orderId, p_reason: reason, p_requester_id: auth.user.id });
    if (error) {
      const message = error.message || "Could not submit the review removal request.";
      const status = /already exists|pending/i.test(message) ? 409 : /not found/i.test(message) ? 404 : 400;
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ request: data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("OWNER_REVIEW_REMOVAL_REQUEST_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "OWNER_REVIEW_REMOVAL_REQUEST_FAILED" }, { status: 500 });
  }
}
