import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_SHOP_ROWS = 10000;
const MAX_REVIEW_ROWS = 10000;
const MAX_CATEGORY_ROWS = 10000;
const MAX_SERVICE_ROWS = 10000;
const SHOP_PAGE_SIZE = 15;
const REVIEW_PAGE_SIZE = 10;
const CATEGORY_PAGE_SIZE = 10;
const SERVICE_PAGE_SIZE = 10;
const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];
const APPROVAL_FILTERS = new Set(["ALL", "PENDING", "APPROVED", "REJECTED"]);
const LIFECYCLE_FILTERS = new Set(["ALL", "ACTIVE", "LOCKED", "ARCHIVED"]);
const VISIBILITY_FILTERS = new Set(["ALL", "VISIBLE", "HIDDEN"]);
const REVIEW_SORTS = new Set(["RECENT", "HIGHEST", "LOWEST"]);
const CATEGORY_FILTERS = new Set(["ALL", "PENDING", "APPROVED", "REJECTED"]);

function clampPage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeValue(value, allowed, fallback) {
  const normalized = String(value || fallback).toUpperCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeApprovalStatus(value) {
  return String(value || "PENDING").toUpperCase();
}

function normalizeLifecycleState(value) {
  return String(value || "ACTIVE").toUpperCase();
}

function getItemName(items) {
  try {
    const parsed = typeof items === "string" ? JSON.parse(items) : items;
    return Array.isArray(parsed) && parsed[0]?.name ? String(parsed[0].name) : null;
  } catch {
    return null;
  }
}

function latestDate(...values) {
  return values
    .filter(Boolean)
    .map((value) => String(value))
    .sort((first, second) => second.localeCompare(first))[0] || null;
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
    if (sort === "HIGHEST") {
      return Number(second.rating || 0) - Number(first.rating || 0)
        || String(second.created_at || "").localeCompare(String(first.created_at || ""));
    }
    if (sort === "LOWEST") {
      return Number(first.rating || 0) - Number(second.rating || 0)
        || String(second.created_at || "").localeCompare(String(first.created_at || ""));
    }
    return String(second.created_at || "").localeCompare(String(first.created_at || ""));
  });
}

async function readRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function createGroup(business, profileMap) {
  const owner = profileMap[business.owner_id] || null;
  return {
    shopId: business.id,
    shopName: business.name || "Unnamed shop",
    ownerName: owner?.full_name || "Business Owner",
    approvalStatus: normalizeApprovalStatus(business.status),
    lifecycleState: normalizeLifecycleState(business.lifecycle_state),
    business: {
      id: business.id,
      name: business.name || "Unnamed shop",
      status: normalizeApprovalStatus(business.status),
      lifecycle_state: normalizeLifecycleState(business.lifecycle_state),
      description: business.description || "",
      products_summary: business.products_summary || "",
      address: business.address || "",
      phone: business.phone || "",
      email: business.email || "",
      is_open: business.is_open,
      facebook_url: business.facebook_url || "",
      instagram_url: business.instagram_url || "",
      tiktok_url: business.tiktok_url || "",
      logo_url: business.logo_url || null,
      created_at: business.created_at,
      updated_at: business.updated_at,
      last_activity_at: business.last_activity_at,
      locked_at: business.locked_at,
      lock_reason: business.lock_reason || "",
      archived_at: business.archived_at,
    },
    owner: owner
      ? { id: owner.id, full_name: owner.full_name || "Business Owner", email: owner.email || "", phone: owner.phone || "", role: owner.role || "BUSINESS_OWNER" }
      : { id: business.owner_id, full_name: "Business Owner", email: "", phone: "", role: "BUSINESS_OWNER" },
    reviews: [],
    categoryApprovals: [],
    services: [],
    totalReviewCount: 0,
    visibleCount: 0,
    hiddenCount: 0,
    ratingTotal: 0,
    pendingCategoryCount: 0,
    approvedCategoryCount: 0,
    rejectedCategoryCount: 0,
    serviceCount: 0,
    latestReviewDate: null,
    latestCategoryDate: null,
  };
}

function buildSummary(group) {
  const latestActivityDate = latestDate(
    group.business.last_activity_at,
    group.business.updated_at,
    group.business.created_at,
    group.latestReviewDate,
    group.latestCategoryDate,
  );
  const averageRating = group.totalReviewCount > 0
    ? (group.ratingTotal / group.totalReviewCount).toFixed(1)
    : "0.0";
  return {
    shopId: group.shopId,
    shopName: group.shopName,
    ownerName: group.ownerName,
    approvalStatus: group.approvalStatus,
    lifecycleState: group.lifecycleState,
    averageRating,
    totalReviewCount: group.totalReviewCount,
    visibleCount: group.visibleCount,
    hiddenCount: group.hiddenCount,
    totalCategoryApprovalCount: group.categoryApprovals.length,
    serviceCount: group.serviceCount,
    pendingCategoryCount: group.pendingCategoryCount,
    approvedCategoryCount: group.approvedCategoryCount,
    rejectedCategoryCount: group.rejectedCategoryCount,
    latestReviewDate: group.latestReviewDate,
    latestCategoryDate: group.latestCategoryDate,
    latestActivityDate,
    overallActivity: group.totalReviewCount === 0 && group.categoryApprovals.length === 0
      ? "No reviews or category approvals yet"
      : `${group.totalReviewCount} review${group.totalReviewCount === 1 ? "" : "s"} · ${group.pendingCategoryCount} pending categor${group.pendingCategoryCount === 1 ? "y" : "ies"}`,
  };
}

function createActivityList(group) {
  const events = [];
  const shopDate = latestDate(group.business.last_activity_at, group.business.updated_at, group.business.created_at);
  if (shopDate) events.push({ type: "SHOP", label: "Shop information updated", date: shopDate });
  group.reviews.forEach((review) => {
    if (review.created_at) events.push({ type: "REVIEW", label: "Customer review received", date: review.created_at });
  });
  group.categoryApprovals.forEach((request) => {
    if (request.created_at) events.push({ type: "CATEGORY", label: `${request.category_name || "Category"} approval request ${String(request.status).toLowerCase()}`, date: request.created_at });
  });
  return events
    .sort((first, second) => String(second.date).localeCompare(String(first.date)))
    .slice(0, 8);
}

function mapReview(row, profileMap) {
  return {
    order_id: row.id,
    business_id: row.business_id,
    customer_name: profileMap[row.customer_id]?.full_name || "Customer",
    rating: Number(row.rating),
    feedback: row.feedback || "",
    feedback_hidden: Boolean(row.feedback_hidden),
    feedback_hidden_at: row.feedback_hidden_at || null,
    feedback_hidden_by: row.feedback_hidden_by || null,
    created_at: row.created_at,
    order_status: row.status,
    item_name: getItemName(row.items),
  };
}

function mapCategoryRequest(row) {
  return {
    id: row.id,
    business_id: row.business_id,
    category_name: row.category_name || "Unnamed category",
    reason: row.reason || "",
    status: String(row.status || "PENDING").toUpperCase(),
    admin_comment: row.admin_comment || null,
    created_at: row.created_at,
  };
}

function parseSpecs(value) {
  if (typeof value === "string") {
    try { return JSON.parse(value) || {}; } catch { return {}; }
  }
  return value && typeof value === "object" ? value : {};
}

function mapService(row, rules) {
  const specs = parseSpecs(row.specs_json);
  const serviceRules = (rules || []).filter((rule) => rule.active !== false);
  const allowedSizes = [...new Set([...(Array.isArray(specs.allowed_sizes) ? specs.allowed_sizes : []), ...serviceRules.filter((rule) => rule.option_type === "SIZE").map((rule) => rule.option_name)])];
  const allowedMaterials = [...new Set([...(Array.isArray(specs.allowed_materials) ? specs.allowed_materials : []), ...serviceRules.filter((rule) => rule.option_type === "MATERIAL").map((rule) => rule.option_name)])];
  const qualityLevels = [...new Set([...(Array.isArray(specs.quality_levels) ? specs.quality_levels : []), ...serviceRules.filter((rule) => rule.option_type === "QUALITY").map((rule) => rule.option_name)])];
  return {
    id: row.id,
    business_id: row.business_id,
    name: row.name || "Unnamed catalog item",
    category: row.category || "General Printing",
    description: row.description || "",
    price: row.price,
    price_max: row.price_max,
    item_type: row.item_type || "service",
    available: row.available !== false,
    is_customizable: row.is_customizable !== false,
    stock_qty: row.stock_qty,
    low_stock_threshold: row.low_stock_threshold,
    image_url: row.image_url || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    specs: {
      ...specs,
      allowed_sizes: allowedSizes,
      allowed_materials: allowedMaterials,
      quality_levels: qualityLevels,
      price_modifiers: specs.price_modifiers || Object.fromEntries(serviceRules.map((rule) => [rule.option_name, Number(rule.price_modifier || 0)])),
    },
  };
}

function toShopSummary(group) {
  return buildSummary(group);
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const search = normalizeText(params.get("search"));
    const approvalStatus = normalizeValue(params.get("approvalStatus"), APPROVAL_FILTERS, "ALL");
    const lifecycle = normalizeValue(params.get("lifecycle"), LIFECYCLE_FILTERS, "ALL");
    const visibility = normalizeValue(params.get("visibility"), VISIBILITY_FILTERS, "ALL");
    const reviewSort = normalizeValue(params.get("reviewSort"), REVIEW_SORTS, "RECENT");
    const categoryStatus = normalizeValue(params.get("categoryStatus"), CATEGORY_FILTERS, "ALL");
    const shopPage = clampPage(params.get("page"));
    const servicePage = clampPage(params.get("servicePage"));
    const reviewPage = clampPage(params.get("reviewPage"));
    const categoryPage = clampPage(params.get("categoryPage"));
    const selectedShopId = String(params.get("shopId") || "").trim() || null;

    const [businesses, reviewRows, categoryRows, serviceRows, pricingRows] = await Promise.all([
      readRows(auth.supabase.from("businesses").select("id, name, status, owner_id, description, products_summary, address, phone, email, facebook_url, instagram_url, tiktok_url, logo_url, is_open, created_at, updated_at, lifecycle_state, last_activity_at, locked_at, lock_reason, archived_at").order("name", { ascending: true }).range(0, MAX_SHOP_ROWS - 1)),
      readRows(auth.supabase.from("orders").select("id, business_id, customer_id, status, rating, feedback, feedback_hidden, feedback_hidden_at, feedback_hidden_by, created_at, items").in("status", COMPLETED_STATUSES).not("rating", "is", null).order("created_at", { ascending: false }).range(0, MAX_REVIEW_ROWS - 1)),
      readRows(auth.supabase.from("category_approval_requests").select("id, business_id, category_name, reason, status, created_at").order("created_at", { ascending: false }).range(0, MAX_CATEGORY_ROWS - 1)),
      readRows(auth.supabase.from("services").select("id, business_id, name, category, description, price, price_max, item_type, available, is_customizable, stock_qty, low_stock_threshold, specs_json, image_url, created_at, updated_at").order("created_at", { ascending: false }).range(0, MAX_SERVICE_ROWS - 1)),
      readRows(auth.supabase.from("service_pricing_rules").select("id, business_id, service_id, option_type, option_name, price_modifier, is_default, active").order("sort_order", { ascending: true }).range(0, MAX_SERVICE_ROWS - 1)),
    ]);

    const profileIds = [...new Set([
      ...businesses.map((business) => business.owner_id),
      ...reviewRows.map((row) => row.customer_id),
    ].filter(Boolean))];
    const profiles = profileIds.length > 0
      ? await readRows(auth.supabase.from("profiles").select("id, full_name, email, phone, role").in("id", profileIds))
      : [];
    const profileMap = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    const groups = new Map(businesses.map((business) => [business.id, createGroup(business, profileMap)]));

    reviewRows.forEach((row) => {
      const group = groups.get(row.business_id);
      if (!group) return;
      const review = mapReview(row, profileMap);
      group.reviews.push(review);
      group.totalReviewCount += 1;
      group.ratingTotal += review.rating || 0;
      if (review.feedback_hidden) group.hiddenCount += 1;
      else group.visibleCount += 1;
      group.latestReviewDate = latestDate(group.latestReviewDate, review.created_at);
    });

    categoryRows.forEach((row) => {
      const group = groups.get(row.business_id);
      if (!group) return;
      const categoryRequest = mapCategoryRequest(row);
      group.categoryApprovals.push(categoryRequest);
      if (categoryRequest.status === "PENDING") group.pendingCategoryCount += 1;
      if (categoryRequest.status === "APPROVED") group.approvedCategoryCount += 1;
      if (categoryRequest.status === "REJECTED") group.rejectedCategoryCount += 1;
      group.latestCategoryDate = latestDate(group.latestCategoryDate, categoryRequest.created_at);
    });

    const pricingByService = new Map();
    pricingRows.forEach((rule) => {
      pricingByService.set(rule.service_id, [...(pricingByService.get(rule.service_id) || []), rule]);
    });
    serviceRows.forEach((row) => {
      const group = groups.get(row.business_id);
      if (!group) return;
      group.services.push(mapService(row, pricingByService.get(row.id)));
      group.serviceCount += 1;
    });

    const allGroups = [...groups.values()];
    const filteredGroups = allGroups
      .filter((group) => approvalStatus === "ALL" || group.approvalStatus === approvalStatus)
      .filter((group) => lifecycle === "ALL" || group.lifecycleState === lifecycle)
      .filter((group) => !search || normalizeText(`${group.shopName} ${group.ownerName}`).includes(search))
      .sort((first, second) => latestDate(second.business.last_activity_at, second.latestReviewDate, second.latestCategoryDate, second.business.updated_at, second.business.created_at)?.localeCompare(latestDate(first.business.last_activity_at, first.latestReviewDate, first.latestCategoryDate, first.business.updated_at, first.business.created_at) || "") || first.shopName.localeCompare(second.shopName));
    const { rows: pagedGroups, pagination: shopPagination } = paginate(filteredGroups, shopPage, SHOP_PAGE_SIZE);

    const selectedGroup = selectedShopId ? allGroups.find((group) => group.shopId === selectedShopId) : null;
    let selectedShop = null;
    if (selectedGroup) {
      const selectedReviews = sortReviews(selectedGroup.reviews.filter((review) => {
        if (visibility === "VISIBLE" && review.feedback_hidden) return false;
        if (visibility === "HIDDEN" && !review.feedback_hidden) return false;
        return true;
      }), reviewSort);
      const selectedCategories = selectedGroup.categoryApprovals
        .filter((row) => categoryStatus === "ALL" || row.status === categoryStatus)
        .sort((first, second) => String(second.created_at || "").localeCompare(String(first.created_at || "")));
      const servicePageResult = paginate(selectedGroup.services, servicePage, SERVICE_PAGE_SIZE);
      const reviewPageResult = paginate(selectedReviews, reviewPage, REVIEW_PAGE_SIZE);
      const categoryPageResult = paginate(selectedCategories, categoryPage, CATEGORY_PAGE_SIZE);
      selectedShop = {
        ...toShopSummary(selectedGroup),
        business: selectedGroup.business,
        owner: selectedGroup.owner,
        recentActivity: createActivityList(selectedGroup),
        services: servicePageResult.rows,
        servicePagination: servicePageResult.pagination,
        reviews: reviewPageResult.rows,
        reviewPagination: reviewPageResult.pagination,
        categoryApprovals: categoryPageResult.rows,
        categoryPagination: categoryPageResult.pagination,
      };
    }

    const totals = allGroups.reduce((summary, group) => {
      summary.totalReviews += group.totalReviewCount;
      summary.visibleReviews += group.visibleCount;
      summary.hiddenReviews += group.hiddenCount;
      summary.pendingCategoryApprovals += group.pendingCategoryCount;
      summary.totalServices += group.serviceCount;
      summary.ratingTotal += group.ratingTotal;
      return summary;
    }, { totalReviews: 0, visibleReviews: 0, hiddenReviews: 0, pendingCategoryApprovals: 0, totalServices: 0, ratingTotal: 0 });
    totals.averageRating = totals.totalReviews > 0 ? (totals.ratingTotal / totals.totalReviews).toFixed(1) : "0.0";
    delete totals.ratingTotal;

    return NextResponse.json({
      shops: pagedGroups.map(toShopSummary),
      selectedShop,
      shopPagination,
      totals: { ...totals, totalShops: filteredGroups.length },
      truncated: {
        shops: businesses.length === MAX_SHOP_ROWS,
        reviews: reviewRows.length === MAX_REVIEW_ROWS,
        categoryApprovals: categoryRows.length === MAX_CATEGORY_ROWS,
        services: serviceRows.length === MAX_SERVICE_ROWS,
      },
    });
  } catch (error) {
    console.error("ADMIN_SHOPS_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_SHOPS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").toUpperCase();

    if (action === "CATEGORY") {
      const requestId = String(body.requestId || "").trim();
      const status = String(body.status || "").toUpperCase();
      if (!requestId || !["APPROVED", "REJECTED"].includes(status)) {
        return NextResponse.json({ error: "INVALID_CATEGORY_APPROVAL_ACTION" }, { status: 400 });
      }
      const { data, error } = await auth.supabase
        .from("category_approval_requests")
        .update({ status })
        .eq("id", requestId)
        .select("id, business_id, category_name, reason, status, created_at")
        .single();
      if (error) throw error;
      return NextResponse.json({ categoryApproval: data });
    }

    if (action === "REVIEW") {
      const orderId = String(body.orderId || "").trim();
      if (!orderId || typeof body.hidden !== "boolean") {
        return NextResponse.json({ error: "INVALID_REVIEW_VISIBILITY_ACTION" }, { status: 400 });
      }
      const hidden = body.hidden;
      const { data, error } = await auth.supabase
        .from("orders")
        .update({
          feedback_hidden: hidden,
          feedback_hidden_at: hidden ? new Date().toISOString() : null,
          feedback_hidden_by: hidden ? "admin" : null,
        })
        .eq("id", orderId)
        .in("status", COMPLETED_STATUSES)
        .not("rating", "is", null)
        .select("id, business_id, feedback_hidden, feedback_hidden_at, feedback_hidden_by")
        .single();
      if (error) throw error;
      return NextResponse.json({ review: data });
    }

    return NextResponse.json({ error: "INVALID_SHOP_ACTION" }, { status: 400 });
  } catch (error) {
    console.error("ADMIN_SHOPS_UPDATE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_SHOP_ACTION_FAILED" }, { status: 500 });
  }
}
