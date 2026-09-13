import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_REQUEST_ROWS = 10000;
const MAX_SHOP_ROWS = 10000;
const SHOP_PAGE_SIZE = 5;
const REQUEST_PAGE_SIZE = 10;
const VALID_STATUSES = new Set(["ALL", "PENDING", "APPROVED", "REJECTED"]);
const ACTION_STATUSES = new Set(["APPROVED", "REJECTED"]);

function clampPage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  const status = String(value || "PENDING").toUpperCase();
  return VALID_STATUSES.has(status) ? status : "PENDING";
}

function formatActivity(group) {
  if (group.pendingCount > 0) return `${group.pendingCount} pending request${group.pendingCount === 1 ? "" : "s"}`;
  if (group.totalCount === 0) return "No category approvals yet";
  return `${group.totalCount} request${group.totalCount === 1 ? "" : "s"} reviewed`;
}

async function readRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
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

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const search = normalizeText(params.get("search"));
    const requestedStatus = String(params.get("status") || "ALL").toUpperCase();
    const status = VALID_STATUSES.has(requestedStatus) ? requestedStatus : "ALL";
    const shopPage = clampPage(params.get("page"));
    const requestPage = clampPage(params.get("requestPage"));
    const selectedShopId = String(params.get("shopId") || "").trim() || null;

    const requestRows = await readRows(
      auth.supabase
        .from("category_approval_requests")
        .select("id, business_id, category_name, reason, status, created_at")
        .order("created_at", { ascending: false })
        .range(0, MAX_REQUEST_ROWS - 1),
    );

    const businesses = await readRows(
      auth.supabase.from("businesses").select("id, name, owner_id").order("name", { ascending: true }).range(0, MAX_SHOP_ROWS - 1),
    );
    const ownerIds = [...new Set(businesses.map((business) => business.owner_id).filter(Boolean))];
    const owners = ownerIds.length > 0
      ? await readRows(auth.supabase.from("profiles").select("id, full_name").in("id", ownerIds))
      : [];

    const businessMap = Object.fromEntries(businesses.map((business) => [business.id, business]));
    const ownerMap = Object.fromEntries(owners.map((owner) => [owner.id, owner]));
    const groups = new Map();

    businesses.forEach((business) => {
      const owner = ownerMap[business.owner_id];
      groups.set(business.id, {
        shopId: business.id,
        shopName: business.name || "Unknown shop",
        ownerName: owner?.full_name || "Business Owner",
        requests: [],
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        totalCount: 0,
        latestRequestDate: null,
      });
    });

    requestRows.forEach((row) => {
      const business = businessMap[row.business_id];
      const owner = business ? ownerMap[business.owner_id] : null;
      const group = groups.get(row.business_id) || {
        shopId: row.business_id,
        shopName: business?.name || "Unknown shop",
        ownerName: owner?.full_name || "Business Owner",
        requests: [],
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        totalCount: 0,
        latestRequestDate: null,
      };
      const rowStatus = normalizeStatus(row.status);
      group.requests.push({ ...row, status: rowStatus });
      group.totalCount += 1;
      if (rowStatus === "PENDING") group.pendingCount += 1;
      if (rowStatus === "APPROVED") group.approvedCount += 1;
      if (rowStatus === "REJECTED") group.rejectedCount += 1;
      if (!group.latestRequestDate || String(row.created_at) > String(group.latestRequestDate)) group.latestRequestDate = row.created_at;
      groups.set(row.business_id, group);
    });

    const allGroups = [...groups.values()].map((group) => ({
      ...group,
      overallActivity: formatActivity(group),
    }));
    const matchesRow = (group, row) => {
      const rowStatus = normalizeStatus(row.status);
      if (status !== "ALL" && rowStatus !== status) return false;
      if (!search) return true;
      const shopAndOwner = normalizeText(`${group.shopName} ${group.ownerName}`);
      return shopAndOwner.includes(search) || normalizeText(row.category_name).includes(search);
    };
    const filteredGroups = allGroups
      .filter((group) => group.requests.length === 0
        ? status === "ALL" && (!search || normalizeText(`${group.shopName} ${group.ownerName}`).includes(search))
        : group.requests.some((row) => matchesRow(group, row)))
      .sort((first, second) => String(second.latestRequestDate || "").localeCompare(String(first.latestRequestDate || "")));
    const { rows: pagedGroups, pagination: shopPagination } = paginate(filteredGroups, shopPage, SHOP_PAGE_SIZE);

    const selectedGroup = selectedShopId ? allGroups.find((group) => group.shopId === selectedShopId) : null;
    let selectedShop = null;
    if (selectedGroup) {
      const selectedRequests = selectedGroup.requests
        .filter((row) => matchesRow(selectedGroup, row))
        .sort((first, second) => String(second.created_at || "").localeCompare(String(first.created_at || "")));
      const { rows, pagination } = paginate(selectedRequests, requestPage, REQUEST_PAGE_SIZE);
      selectedShop = {
        ...selectedGroup,
        requests: rows,
        requestPagination: pagination,
      };
    }

    const totals = requestRows.reduce((summary, row) => {
      const rowStatus = normalizeStatus(row.status);
      summary.total += 1;
      summary[rowStatus.toLowerCase()] += 1;
      return summary;
    }, { total: 0, pending: 0, approved: 0, rejected: 0 });

    return NextResponse.json({
      shops: pagedGroups.map(({ requests, ...group }) => group),
      selectedShop,
      shopPagination,
      totals,
      truncated: requestRows.length === MAX_REQUEST_ROWS,
    });
  } catch (error) {
    console.error("ADMIN_CATEGORY_APPROVALS_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_CATEGORY_APPROVALS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const requestId = String(body.requestId || "").trim();
    const status = String(body.status || "").toUpperCase();
    if (!requestId || !ACTION_STATUSES.has(status)) {
      return NextResponse.json({ error: "INVALID_CATEGORY_APPROVAL_ACTION" }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("category_approval_requests")
      .update({ status })
      .eq("id", requestId)
      .select("id, business_id, category_name, reason, status, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ request: data });
  } catch (error) {
    console.error("ADMIN_CATEGORY_APPROVAL_UPDATE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_CATEGORY_APPROVAL_UPDATE_FAILED" }, { status: 500 });
  }
}
