import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_REVIEW_ROWS = 10000;
const REVIEW_PAGE_SIZE = 12;
const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];
const VALID_REVIEW_STATES = new Set(["ALL", "PENDING", "VISIBLE", "HIDDEN"]);
const VALID_SORTS = new Set(["RECENT", "HIGHEST", "LOWEST"]);

function clampPage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isHidden(review) {
  return Boolean(review.feedback_hidden);
}

function paginate(rows, page, pageSize) {
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  return {
    rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    pagination: { page: safePage, pageSize, totalItems, totalPages },
  };
}

function sortReviews(rows, sort) {
  return [...rows].sort((first, second) => {
    if (sort === "HIGHEST") return Number(second.rating || 0) - Number(first.rating || 0) || String(second.created_at || "").localeCompare(String(first.created_at || ""));
    if (sort === "LOWEST") return Number(first.rating || 0) - Number(second.rating || 0) || String(second.created_at || "").localeCompare(String(first.created_at || ""));
    return String(second.created_at || "").localeCompare(String(first.created_at || ""));
  });
}

async function readRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const search = normalizeText(params.get("search"));
    const requestedReviewState = String(params.get("reviewState") || params.get("visibility") || "ALL").toUpperCase();
    const reviewState = VALID_REVIEW_STATES.has(requestedReviewState) ? requestedReviewState : "ALL";
    const requestedSort = String(params.get("sort") || "RECENT").toUpperCase();
    const sort = VALID_SORTS.has(requestedSort) ? requestedSort : "RECENT";
    const reviewPage = clampPage(params.get("reviewPage") || params.get("page"));

    const orderRows = await readRows(
      auth.supabase
        .from("orders")
        .select("id, business_id, customer_id, status, rating, feedback, feedback_hidden, feedback_hidden_at, feedback_hidden_by, created_at, review_service_id")
        .in("status", COMPLETED_STATUSES)
        .not("rating", "is", null)
        .order("created_at", { ascending: false })
        .range(0, MAX_REVIEW_ROWS - 1),
    );
    const itemReviewRows = await readRows(
      auth.supabase
        .from("order_item_reviews")
        .select("id, order_id, business_id, customer_id, service_id, item_name, item_type, rating, feedback, feedback_hidden, feedback_hidden_at, feedback_hidden_by, created_at")
        .order("created_at", { ascending: false })
        .range(0, MAX_REVIEW_ROWS - 1),
    );
    const businesses = await readRows(
      auth.supabase.from("businesses").select("id, name, owner_id").order("name", { ascending: true }).range(0, MAX_REVIEW_ROWS - 1),
    );
    const profileIds = [...new Set([
      ...businesses.map((business) => business.owner_id),
      ...orderRows.map((row) => row.customer_id),
      ...itemReviewRows.map((row) => row.customer_id),
    ].filter(Boolean))];
    const profiles = profileIds.length > 0
      ? await readRows(auth.supabase.from("profiles").select("id, full_name").in("id", profileIds))
      : [];
    const moderationRows = await readRows(
      auth.supabase
        .from("review_moderation_requests")
        .select("id, order_id, business_id, owner_id, review_id, reason, status, admin_response, reviewed_by, reviewed_at, created_at, updated_at")
        .order("created_at", { ascending: false })
        .range(0, MAX_REVIEW_ROWS - 1),
    );
    const pendingOrderIds = new Set(moderationRows.filter((row) => row.status === "PENDING" && !row.review_id).map((row) => row.order_id));
    const pendingItemReviewIds = new Set(moderationRows.filter((row) => row.status === "PENDING" && row.review_id).map((row) => row.review_id));
    const pendingRequestMap = new Map(moderationRows.filter((row) => row.status === "PENDING").map((row) => [row.review_id ? `ITEM:${row.review_id}` : `ORDER:${row.order_id}`, row]));
    const serviceIds = [...new Set([...orderRows.map((row) => row.review_service_id), ...itemReviewRows.map((row) => row.service_id)].filter(Boolean))];
    const services = serviceIds.length > 0
      ? await readRows(auth.supabase.from("services").select("id, name, item_type").in("id", serviceIds))
      : [];

    const businessMap = Object.fromEntries(businesses.map((business) => [business.id, business]));
    const profileMap = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    const serviceMap = Object.fromEntries(services.map((service) => [service.id, service]));
    const getBusinessInfo = (businessId) => {
      const business = businessMap[businessId];
      return {
        shop_name: business?.name || "Unknown shop",
        owner_name: profileMap[business?.owner_id]?.full_name || "Business Owner",
      };
    };

    const reviews = [
      ...orderRows.map((row) => ({
        review_id: row.id,
        review_type: "ORDER",
        order_id: row.id,
        business_id: row.business_id,
        customer_id: row.customer_id,
        ...getBusinessInfo(row.business_id),
        customer_name: profileMap[row.customer_id]?.full_name || "Customer",
        rating: Number(row.rating),
        feedback: row.feedback || "",
        feedback_hidden: isHidden(row),
        feedback_hidden_at: row.feedback_hidden_at,
        feedback_hidden_by: row.feedback_hidden_by,
        created_at: row.created_at,
        item_name: serviceMap[row.review_service_id]?.name || null,
        review_target_type: serviceMap[row.review_service_id]?.item_type || null,
        pending_request: pendingRequestMap.get(`ORDER:${row.id}`) || null,
      })),
      ...itemReviewRows.map((row) => ({
        review_id: row.id,
        review_type: "ITEM",
        order_id: row.order_id,
        business_id: row.business_id,
        customer_id: row.customer_id,
        ...getBusinessInfo(row.business_id),
        customer_name: profileMap[row.customer_id]?.full_name || "Customer",
        rating: Number(row.rating),
        feedback: row.feedback || "",
        feedback_hidden: isHidden(row),
        feedback_hidden_at: row.feedback_hidden_at,
        feedback_hidden_by: row.feedback_hidden_by,
        created_at: row.created_at,
        item_name: row.item_name || serviceMap[row.service_id]?.name || null,
        review_target_type: row.item_type || serviceMap[row.service_id]?.item_type || null,
        pending_request: pendingRequestMap.get(`ITEM:${row.id}`) || null,
      })),
    ];

    const matchesReview = (review) => {
      if (reviewState === "PENDING") {
        const isPending = review.review_type === "ITEM"
          ? pendingItemReviewIds.has(review.review_id)
          : pendingOrderIds.has(review.review_id);
        if (!isPending) return false;
      }
      if (reviewState === "VISIBLE" && review.feedback_hidden) return false;
      if (reviewState === "HIDDEN" && !review.feedback_hidden) return false;
      if (!search) return true;
      return normalizeText(`${review.shop_name} ${review.owner_name} ${review.customer_name} ${review.feedback} ${review.item_name}`).includes(search);
    };
    const filteredReviews = sortReviews(reviews.filter(matchesReview), sort);
    const { rows: pagedReviews, pagination: reviewPagination } = paginate(filteredReviews, reviewPage, REVIEW_PAGE_SIZE);

    const totals = reviews.reduce((summary, row) => {
      summary.total += 1;
      if (isHidden(row)) summary.hidden += 1;
      else summary.visible += 1;
      summary.ratingTotal += Number(row.rating) || 0;
      return summary;
    }, { total: 0, visible: 0, hidden: 0, ratingTotal: 0 });
    const averageRating = totals.total > 0 ? (totals.ratingTotal / totals.total).toFixed(1) : "0.0";
    const orderMap = Object.fromEntries(orderRows.map((row) => [row.id, row]));
    const itemReviewMap = Object.fromEntries(itemReviewRows.map((row) => [row.id, row]));
    const moderationRequests = moderationRows.map((request) => {
      const order = orderMap[request.order_id];
      const itemReview = request.review_id ? itemReviewMap[request.review_id] : null;
      const review = reviews.find((row) => row.review_id === (itemReview?.id || order?.id) && row.review_type === (itemReview ? "ITEM" : "ORDER"));
      return {
        ...request,
        shop_name: review?.shop_name || getBusinessInfo(request.business_id).shop_name,
        owner_name: review?.owner_name || getBusinessInfo(request.business_id).owner_name,
        customer_name: review?.customer_name || "Customer",
        rating: review?.rating ?? null,
        review_text: review?.feedback || "",
        feedback_hidden: Boolean(review?.feedback_hidden),
        review_type: itemReview ? "ITEM" : "ORDER",
        review_target_name: review?.item_name || null,
        review_target_type: review?.review_target_type || null,
      };
    });

    return NextResponse.json({
      reviews: pagedReviews,
      reviewPagination,
      reviewState,
      totals: { ...totals, averageRating },
      moderationRequests,
      moderationSummary: {
        total: moderationRequests.length,
        pending: moderationRequests.filter((request) => request.status === "PENDING").length,
        approved: moderationRequests.filter((request) => request.status === "APPROVED").length,
        rejected: moderationRequests.filter((request) => request.status === "REJECTED").length,
      },
      truncated: orderRows.length === MAX_REVIEW_ROWS || itemReviewRows.length === MAX_REVIEW_ROWS,
    });
  } catch (error) {
    console.error("ADMIN_REVIEWS_LOAD_ERROR:", {
      name: error instanceof Error ? error.name : "DatabaseError",
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return NextResponse.json({ error: "ADMIN_REVIEWS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    if (body.action === "MODERATE_REQUEST") {
      const requestId = String(body.requestId || "").trim();
      const status = String(body.status || "").trim().toUpperCase();
      const response = String(body.response || "").trim().slice(0, 1000) || null;
      if (!requestId || !["APPROVED", "REJECTED"].includes(status)) {
        return NextResponse.json({ error: "INVALID_REVIEW_MODERATION_ACTION" }, { status: 400 });
      }
      const { data, error } = await auth.supabase.rpc("moderate_review_removal", {
        p_request_id: requestId,
        p_status: status,
        p_response: response,
        p_requester_id: auth.user.id,
      });
      if (error) {
        const message = error.message || "Could not moderate this review request.";
        return NextResponse.json({ error: message }, { status: /already|not found/i.test(message) ? 409 : 400 });
      }
      return NextResponse.json({ request: data });
    }

    const reviewType = String(body.reviewType || "ORDER").toUpperCase();
    const hidden = body.hidden;
    if (typeof hidden !== "boolean") {
      return NextResponse.json({ error: "INVALID_REVIEW_VISIBILITY_ACTION" }, { status: 400 });
    }

    if (reviewType === "ITEM") {
      const reviewId = String(body.reviewId || "").trim();
      if (!reviewId) return NextResponse.json({ error: "INVALID_ITEM_REVIEW_ID" }, { status: 400 });
      const { data, error } = await auth.supabase.rpc("set_admin_item_review_visibility", {
        p_review_id: reviewId,
        p_hidden: hidden,
        p_note: String(body.note || "").trim().slice(0, 1000) || null,
        p_requester_id: auth.user.id,
      });
      if (error) throw error;
      return NextResponse.json({ review: {
        id: data?.id,
        review_type: "ITEM",
        feedback_hidden: Boolean(data?.feedback_hidden),
        feedback_hidden_at: data?.feedback_hidden_at || null,
        feedback_hidden_by: data?.feedback_hidden_by || null,
      } });
    }

    const orderId = String(body.orderId || "").trim();
    if (!orderId) return NextResponse.json({ error: "INVALID_REVIEW_ID" }, { status: 400 });
    const { data, error } = await auth.supabase.rpc("set_admin_review_visibility", {
      p_order_id: orderId,
      p_hidden: hidden,
      p_note: String(body.note || "").trim().slice(0, 1000) || null,
      p_requester_id: auth.user.id,
    });
    if (error) throw error;

    return NextResponse.json({ review: {
      id: data?.id,
      review_type: "ORDER",
      feedback_hidden: Boolean(data?.feedback_hidden),
      feedback_hidden_at: data?.feedback_hidden_at || null,
      feedback_hidden_by: data?.feedback_hidden_by || null,
    } });
  } catch (error) {
    console.error("ADMIN_REVIEW_UPDATE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_REVIEW_UPDATE_FAILED" }, { status: 500 });
  }
}
