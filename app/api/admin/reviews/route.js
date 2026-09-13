import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_REVIEW_ROWS = 10000;
const MAX_SHOP_ROWS = 10000;
const SHOP_PAGE_SIZE = 5;
const REVIEW_PAGE_SIZE = 10;
const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];
const VALID_VISIBILITY = new Set(["ALL", "VISIBLE", "HIDDEN"]);
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
    const requestedVisibility = String(params.get("visibility") || "ALL").toUpperCase();
    const visibility = VALID_VISIBILITY.has(requestedVisibility) ? requestedVisibility : "ALL";
    const requestedSort = String(params.get("sort") || "RECENT").toUpperCase();
    const sort = VALID_SORTS.has(requestedSort) ? requestedSort : "RECENT";
    const shopPage = clampPage(params.get("page"));
    const reviewPage = clampPage(params.get("reviewPage"));
    const selectedShopId = String(params.get("shopId") || "").trim() || null;

    const orderRows = await readRows(
      auth.supabase
        .from("orders")
        .select("id, business_id, customer_id, status, rating, feedback, feedback_hidden, feedback_hidden_at, feedback_hidden_by, created_at, items, review_service_id")
        .in("status", COMPLETED_STATUSES)
        .not("rating", "is", null)
        .order("created_at", { ascending: false })
        .range(0, MAX_REVIEW_ROWS - 1),
    );

    const businesses = await readRows(
      auth.supabase.from("businesses").select("id, name, owner_id").order("name", { ascending: true }).range(0, MAX_SHOP_ROWS - 1),
    );
    const profileIds = [...new Set([
      ...businesses.map((business) => business.owner_id),
      ...orderRows.map((row) => row.customer_id),
    ].filter(Boolean))];
    const profiles = profileIds.length > 0
      ? await readRows(auth.supabase.from("profiles").select("id, full_name").in("id", profileIds))
      : [];
    const moderationRows = await readRows(
      auth.supabase
        .from("review_moderation_requests")
        .select("id, order_id, business_id, owner_id, reason, status, admin_response, reviewed_by, reviewed_at, created_at, updated_at")
        .order("created_at", { ascending: false })
        .range(0, MAX_REVIEW_ROWS - 1),
    );
    const serviceIds = [...new Set(orderRows.map((row) => row.review_service_id).filter(Boolean))];
    const services = serviceIds.length > 0
      ? await readRows(auth.supabase.from("services").select("id, name, item_type").in("id", serviceIds))
      : [];
    const businessMap = Object.fromEntries(businesses.map((business) => [business.id, business]));
    const profileMap = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    const serviceMap = Object.fromEntries(services.map((service) => [service.id, service]));
    const groups = new Map();

    businesses.forEach((business) => {
      groups.set(business.id, {
        shopId: business.id,
        shopName: business.name || "Unknown shop",
        ownerName: profileMap[business.owner_id]?.full_name || "Business Owner",
        reviews: [],
        totalReviewCount: 0,
        visibleCount: 0,
        hiddenCount: 0,
        ratingTotal: 0,
        recentReviewDate: null,
      });
    });

    orderRows.forEach((row) => {
      const business = businessMap[row.business_id];
      const owner = business ? profileMap[business.owner_id] : null;
      const group = groups.get(row.business_id) || {
        shopId: row.business_id,
        shopName: business?.name || "Unknown shop",
        ownerName: owner?.full_name || "Business Owner",
        reviews: [],
        totalReviewCount: 0,
        visibleCount: 0,
        hiddenCount: 0,
        ratingTotal: 0,
        recentReviewDate: null,
      };
      const review = {
        order_id: row.id,
        business_id: row.business_id,
        rating: Number(row.rating),
        feedback: row.feedback || "",
        feedback_hidden: isHidden(row),
        feedback_hidden_at: row.feedback_hidden_at,
        feedback_hidden_by: row.feedback_hidden_by,
        created_at: row.created_at,
        customer_name: profileMap[row.customer_id]?.full_name || "Customer",
        item_name: serviceMap[row.review_service_id]?.name || null,
        review_service_id: row.review_service_id || null,
        review_target_type: serviceMap[row.review_service_id]?.item_type || null,
      };
      group.reviews.push(review);
      group.totalReviewCount += 1;
      group.ratingTotal += review.rating;
      if (review.feedback_hidden) group.hiddenCount += 1;
      else group.visibleCount += 1;
      if (!group.recentReviewDate || String(row.created_at) > String(group.recentReviewDate)) group.recentReviewDate = row.created_at;
      groups.set(row.business_id, group);
    });

    const allGroups = [...groups.values()].map((group) => ({
      ...group,
      averageRating: group.totalReviewCount > 0 ? (group.ratingTotal / group.totalReviewCount).toFixed(1) : "0.0",
      overallActivity: `${group.visibleCount} visible · ${group.hiddenCount} hidden`,
    }));
    const matchesReview = (group, review) => {
      if (visibility === "VISIBLE" && review.feedback_hidden) return false;
      if (visibility === "HIDDEN" && !review.feedback_hidden) return false;
      if (!search) return true;
      const shopAndOwner = normalizeText(`${group.shopName} ${group.ownerName}`);
      if (shopAndOwner.includes(search)) return true;
      return normalizeText(`${review.customer_name} ${review.feedback} ${review.item_name}`).includes(search);
    };
    const filteredGroups = allGroups
      .filter((group) => group.reviews.length === 0
        ? visibility === "ALL" && (!search || normalizeText(`${group.shopName} ${group.ownerName}`).includes(search))
        : group.reviews.some((review) => matchesReview(group, review)))
      .sort((first, second) => {
        if (sort === "HIGHEST") return Number(second.averageRating) - Number(first.averageRating) || second.totalReviewCount - first.totalReviewCount;
        if (sort === "LOWEST") return Number(first.averageRating) - Number(second.averageRating) || second.totalReviewCount - first.totalReviewCount;
        return String(second.recentReviewDate || "").localeCompare(String(first.recentReviewDate || ""));
      });
    const { rows: pagedGroups, pagination: shopPagination } = paginate(filteredGroups, shopPage, SHOP_PAGE_SIZE);

    const selectedGroup = selectedShopId ? allGroups.find((group) => group.shopId === selectedShopId) : null;
    let selectedShop = null;
    if (selectedGroup) {
      const selectedReviews = sortReviews(selectedGroup.reviews.filter((review) => matchesReview(selectedGroup, review)), sort);
      const { rows, pagination } = paginate(selectedReviews, reviewPage, REVIEW_PAGE_SIZE);
      selectedShop = {
        ...selectedGroup,
        reviews: rows,
        reviewPagination: pagination,
      };
    }

    const totals = orderRows.reduce((summary, row) => {
      summary.total += 1;
      if (isHidden(row)) summary.hidden += 1;
      else summary.visible += 1;
      summary.ratingTotal += Number(row.rating) || 0;
      return summary;
    }, { total: 0, visible: 0, hidden: 0, ratingTotal: 0 });
    const averageRating = totals.total > 0 ? (totals.ratingTotal / totals.total).toFixed(1) : "0.0";
    const orderMap = Object.fromEntries(orderRows.map((row) => [row.id, row]));
    const moderationRequests = moderationRows.map((request) => {
      const order = orderMap[request.order_id];
      const business = businessMap[request.business_id];
      return {
        ...request,
        shop_name: business?.name || "Unknown shop",
        owner_name: profileMap[business?.owner_id || request.owner_id]?.full_name || "Business Owner",
        customer_name: profileMap[order?.customer_id]?.full_name || "Customer",
        rating: order?.rating == null ? null : Number(order.rating),
        review_text: order?.feedback || "",
        feedback_hidden: Boolean(order?.feedback_hidden),
        review_service_id: order?.review_service_id || null,
        review_target_name: serviceMap[order?.review_service_id]?.name || null,
        review_target_type: serviceMap[order?.review_service_id]?.item_type || null,
      };
    });

    return NextResponse.json({
      shops: pagedGroups.map(({ reviews, ratingTotal, ...group }) => group),
      selectedShop,
      shopPagination,
      totals: { ...totals, averageRating },
      moderationRequests,
      moderationSummary: {
        total: moderationRequests.length,
        pending: moderationRequests.filter((request) => request.status === "PENDING").length,
        approved: moderationRequests.filter((request) => request.status === "APPROVED").length,
        rejected: moderationRequests.filter((request) => request.status === "REJECTED").length,
      },
      truncated: orderRows.length === MAX_REVIEW_ROWS,
    });
  } catch (error) {
    console.error("ADMIN_REVIEWS_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
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

    const orderId = String(body.orderId || "").trim();
    if (!orderId || typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "INVALID_REVIEW_VISIBILITY_ACTION" }, { status: 400 });
    }

    const hidden = body.hidden;
    const { data, error } = await auth.supabase.rpc("set_admin_review_visibility", {
      p_order_id: orderId,
      p_hidden: hidden,
      p_note: String(body.note || "").trim().slice(0, 1000) || null,
      p_requester_id: auth.user.id,
    });
    if (error) throw error;

    return NextResponse.json({ review: {
      id: data?.id,
      feedback_hidden: Boolean(data?.feedback_hidden),
      feedback_hidden_at: data?.feedback_hidden_at || null,
      feedback_hidden_by: data?.feedback_hidden_by || null,
    } });
  } catch (error) {
    console.error("ADMIN_REVIEW_UPDATE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_REVIEW_UPDATE_FAILED" }, { status: 500 });
  }
}
