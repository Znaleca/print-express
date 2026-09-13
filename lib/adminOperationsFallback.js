const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];
const REFUND_STATUSES = ["CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_CONFIRMED"];

function rangeStartForDays(rangeDays) {
  if (!rangeDays) return null;
  return new Date(Date.now() - (rangeDays * 24 * 60 * 60 * 1000)).toISOString();
}

function bucketFor(value, rangeDays) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString();
  return rangeDays === null ? `${iso.slice(0, 7)}-01` : iso.slice(0, 10);
}

async function readRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function readCount(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

function addRange(query, start) {
  return start ? query.gte("created_at", start) : query;
}

function groupRows(rows, rangeDays, getBucket, createValue, mergeValue) {
  const groups = new Map();
  rows.forEach((row) => {
    const bucket = getBucket(row, rangeDays);
    if (!bucket) return;
    const current = groups.get(bucket) || createValue(bucket);
    mergeValue(current, row);
    groups.set(bucket, current);
  });
  return [...groups.values()].sort((first, second) => first.bucket.localeCompare(second.bucket));
}

function statusCounts(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    const status = row.status || "UNKNOWN";
    counts.set(status, (counts.get(status) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((first, second) => second.count - first.count || first.status.localeCompare(second.status));
}

export async function buildAdminOperationsFallback({ supabase, rangeDays }) {
  const rangeStart = rangeStartForDays(rangeDays);

  const userGrowthQuery = addRange(
    supabase.from("profiles").select("role, created_at").in("role", ["CUSTOMER", "BUSINESS_OWNER"]).limit(20000),
    rangeStart,
  );
  const orderActivityQuery = addRange(
    supabase.from("orders").select("status, total, created_at").limit(20000),
    rangeStart,
  );

  const [
    totalCustomers,
    totalBusinessOwners,
    totalShops,
    pendingVerifications,
    pendingCategoryApprovals,
    totalOrders,
    completedOrders,
    activeShops,
    lockedShops,
    userGrowthRows,
    orderActivityRows,
    shopStatusRows,
    categoryStatusRows,
    pendingVerificationRows,
    pendingCategoryRows,
    recentProfileRows,
    lockedAttentionRows,
    rejectedAttentionRows,
    refundRows,
    recentCustomers,
    recentBusinessOwners,
    recentShops,
    recentOrders,
  ] = await Promise.all([
    readCount(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "CUSTOMER")),
    readCount(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "BUSINESS_OWNER")),
    readCount(supabase.from("businesses").select("id", { count: "exact", head: true })),
    readCount(supabase.from("businesses").select("id", { count: "exact", head: true }).eq("status", "PENDING")),
    readCount(supabase.from("category_approval_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING")),
    readCount(supabase.from("orders").select("id", { count: "exact", head: true })),
    readCount(supabase.from("orders").select("id", { count: "exact", head: true }).in("status", COMPLETED_STATUSES)),
    readCount(supabase.from("businesses").select("id", { count: "exact", head: true }).eq("status", "APPROVED").eq("lifecycle_state", "ACTIVE")),
    readCount(supabase.from("businesses").select("id", { count: "exact", head: true }).eq("status", "APPROVED").eq("lifecycle_state", "LOCKED")),
    readRows(userGrowthQuery),
    readRows(orderActivityQuery),
    readRows(supabase.from("businesses").select("status").limit(20000)),
    readRows(supabase.from("category_approval_requests").select("status").limit(20000)),
    readRows(supabase.from("businesses").select("id, name, status, created_at, owner_id").eq("status", "PENDING").order("created_at", { ascending: false }).limit(5)),
    readRows(supabase.from("category_approval_requests").select("id, business_id, category_name, reason, status, created_at, businesses(name)").eq("status", "PENDING").order("created_at", { ascending: false }).limit(5)),
    readRows(supabase.from("business_profile_change_requests").select("id, status, reason, created_at, businesses(name)").order("created_at", { ascending: false }).limit(5)),
    readRows(supabase.from("businesses").select("id, name, status, lifecycle_state, created_at, last_activity_at, lock_reason").eq("status", "APPROVED").in("lifecycle_state", ["LOCKED", "ARCHIVED"]).order("last_activity_at", { ascending: false }).limit(5)),
    readRows(supabase.from("businesses").select("id, name, status, lifecycle_state, created_at, last_activity_at, lock_reason").eq("status", "REJECTED").order("created_at", { ascending: false }).limit(5)),
    readRows(supabase.from("orders").select("id, status, total, created_at, businesses(name)").in("status", REFUND_STATUSES).order("created_at", { ascending: false }).limit(5)),
    readRows(supabase.from("profiles").select("id, full_name, email, role, created_at").eq("role", "CUSTOMER").order("created_at", { ascending: false }).limit(5)),
    readRows(supabase.from("profiles").select("id, full_name, email, role, created_at").eq("role", "BUSINESS_OWNER").order("created_at", { ascending: false }).limit(5)),
    readRows(supabase.from("businesses").select("id, name, status, lifecycle_state, created_at").order("created_at", { ascending: false }).limit(5)),
    readRows(supabase.from("orders").select("id, status, total, created_at, businesses(name)").order("created_at", { ascending: false }).limit(5)),
  ]);

  const pendingOwnerIds = [...new Set(pendingVerificationRows.map((row) => row.owner_id).filter(Boolean))];
  const pendingOwners = pendingOwnerIds.length > 0
    ? await readRows(supabase.from("profiles").select("id, full_name").in("id", pendingOwnerIds))
    : [];
  const pendingOwnerMap = Object.fromEntries(pendingOwners.map((row) => [row.id, row.full_name]));

  const userGrowth = groupRows(
    userGrowthRows,
    rangeDays,
    (row, days) => bucketFor(row.created_at, days),
    (bucket) => ({ bucket, customers: 0, business_owners: 0, total: 0 }),
    (current, row) => {
      current.total += 1;
      if (row.role === "CUSTOMER") current.customers += 1;
      if (row.role === "BUSINESS_OWNER") current.business_owners += 1;
    },
  );

  const orderActivity = groupRows(
    orderActivityRows,
    rangeDays,
    (row, days) => bucketFor(row.created_at, days),
    (bucket) => ({ bucket, orders: 0, order_value: 0, completed_revenue: 0 }),
    (current, row) => {
      const total = Number(row.total) || 0;
      current.orders += 1;
      current.order_value += total;
      if (COMPLETED_STATUSES.includes(row.status)) current.completed_revenue += total;
    },
  );

  const pendingVerificationsWithOwner = pendingVerificationRows.map((row) => ({
    ...row,
    owner_name: pendingOwnerMap[row.owner_id] || "Unknown",
  }));
  const recentProfileRequests = recentProfileRows.map((row) => ({
    ...row,
    business_name: row.businesses?.name || "Unknown shop",
    businesses: undefined,
  }));
  const refundItems = refundRows.map((row) => ({
    ...row,
    business_name: row.businesses?.name || "Unknown shop",
    businesses: undefined,
  }));
  const recentOrdersWithBusiness = recentOrders.map((row) => ({
    ...row,
    business_name: row.businesses?.name || "Unknown shop",
    businesses: undefined,
  }));
  const attentionShops = [...lockedAttentionRows, ...rejectedAttentionRows]
    .sort((first, second) => String(second.last_activity_at || second.created_at).localeCompare(String(first.last_activity_at || first.created_at)))
    .slice(0, 5);

  return {
    generatedAt: new Date().toISOString(),
    rangeDays,
    dataSource: "bounded-server-fallback",
    kpis: {
      totalCustomers,
      totalBusinessOwners,
      totalShops,
      pendingVerifications,
      pendingCategoryApprovals,
      totalOrders,
      completedOrders,
      activeShops,
      lockedShops,
      completedRevenue: null,
    },
    charts: {
      userGrowth,
      orderActivity,
      ordersByStatus: statusCounts(orderActivityRows),
      shopVerification: statusCounts(shopStatusRows),
      categoryApproval: statusCounts(categoryStatusRows),
    },
    actions: {
      pendingVerifications: pendingVerificationsWithOwner,
      pendingCategoryApprovals: pendingCategoryRows.map((row) => ({
        ...row,
        business_name: row.businesses?.name || "Unknown shop",
        businesses: undefined,
      })),
      recentProfileRequests,
      attentionShops,
      refundItems,
    },
    recent: {
      customers: recentCustomers,
      businessOwners: recentBusinessOwners,
      shops: recentShops,
      orders: recentOrdersWithBusiness,
    },
  };
}
