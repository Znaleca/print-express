import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REQUIRED_DOC_TYPES = ["DTI", "MAYORS_PERMIT", "BIR", "VALID_ID"];
const DOC_META = {
  DTI: "DTI Certificate",
  MAYORS_PERMIT: "Mayor's Permit",
  BIR: "BIR Certificate",
  VALID_ID: "Valid ID",
};
const MAX_BUSINESS_ROWS = 10000;
const MAX_DOCUMENT_ROWS = 40000;
const MAX_PROFILE_REQUEST_ROWS = 10000;
const MAX_PROFILE_REQUESTS_PER_SHOP = 50;
const SHOP_PAGE_SIZE = 15;
const VALID_FILTERS = new Set(["ALL", "PENDING", "PARTIALLY_REVIEWED", "APPROVED", "REJECTED"]);
const ACTION_STATUSES = new Set(["APPROVED", "REJECTED"]);
const PROFILE_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

function clampPage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  const status = String(value || "PENDING").toUpperCase();
  return ACTION_STATUSES.has(status) || status === "PENDING" ? status : "PENDING";
}

function readRows(query) {
  return query.then(({ data, error }) => {
    if (error) throw error;
    return data || [];
  });
}

function paginate(rows, page) {
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / SHOP_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  return {
    rows: rows.slice((safePage - 1) * SHOP_PAGE_SIZE, safePage * SHOP_PAGE_SIZE),
    pagination: { page: safePage, pageSize: SHOP_PAGE_SIZE, totalItems, totalPages },
  };
}

function formatDate(value) {
  return value || null;
}

function getVerificationState(businessStatus, documents) {
  if (documents.some((document) => document.status === "REJECTED")) return "REJECTED";

  const acceptedCount = documents.filter((document) => document.status === "APPROVED").length;
  const hasSubmittedDocument = documents.some((document) => document.id || document.status === "APPROVED");
  const allDocumentsApproved = REQUIRED_DOC_TYPES.every((type) => documents.some(
    (document) => document.doc_type === type && document.status === "APPROVED",
  ));
  if (allDocumentsApproved && businessStatus === "APPROVED") return "APPROVED";
  if (allDocumentsApproved) return "READY_FOR_APPROVAL";
  if (acceptedCount > 0 || hasSubmittedDocument) return "IN_PROGRESS";
  return "NOT_STARTED";
}

function getStateLabel(state) {
  return {
    NOT_STARTED: "Not started",
    IN_PROGRESS: "In progress",
    READY_FOR_APPROVAL: "Ready for approval",
    APPROVED: "Approved",
    REJECTED: "Needs changes",
  }[state] || "In progress";
}

function matchesFilter(shop, filter) {
  if (filter === "ALL") return true;
  if (filter === "APPROVED") return shop.verificationState === "APPROVED";
  if (filter === "REJECTED") return shop.verificationState === "REJECTED";
  if (filter === "PARTIALLY_REVIEWED") {
    return shop.verificationState === "IN_PROGRESS" && shop.acceptedDocumentCount > 0;
  }
  return shop.verificationState === "NOT_STARTED"
    || (shop.verificationState === "IN_PROGRESS" && shop.acceptedDocumentCount === 0)
    || shop.verificationState === "READY_FOR_APPROVAL";
}

function mapDocument(document, type) {
  return {
    id: document?.id || null,
    business_id: document?.business_id || null,
    doc_type: type,
    label: DOC_META[type],
    file_url: document?.file_url || null,
    file_name: document?.file_name || null,
    file_size_bytes: document?.file_size_bytes ?? null,
    file_type: document?.file_type || null,
    file_format: document?.file_format || null,
    quality_requirement: document?.quality_requirement || null,
    tin_number: document?.tin_number || null,
    status: normalizeStatus(document?.status),
    admin_comment: document?.admin_comment || null,
    owner_comment: document?.owner_comment || null,
    created_at: formatDate(document?.created_at),
    updated_at: formatDate(document?.updated_at),
  };
}

function buildShop(business, owner, rawDocuments, profileRequests) {
  const documents = REQUIRED_DOC_TYPES.map((type) => mapDocument(
    rawDocuments.find((document) => document.doc_type === type),
    type,
  ));
  const acceptedDocumentCount = documents.filter((document) => document.status === "APPROVED").length;
  const rejectedDocumentCount = documents.filter((document) => document.status === "REJECTED").length;
  const uploadedDocumentCount = documents.filter((document) => document.id).length;
  const verificationState = getVerificationState(business.status, documents);
  const latestDocumentDate = documents
    .map((document) => document.updated_at || document.created_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const sortedProfileRequests = [...profileRequests].sort((first, second) => String(second.created_at || "").localeCompare(String(first.created_at || "")));
  const pendingProfileRequests = sortedProfileRequests.filter((request) => normalizeStatus(request.status) === "PENDING");
  const latestPendingProfileChange = pendingProfileRequests[0] || null;

  return {
    shopId: business.id,
    shopName: business.name || "Unnamed shop",
    ownerName: owner?.full_name || "Business Owner",
    ownerEmail: owner?.email || business.email || null,
    submissionDate: business.created_at || null,
    verificationState,
    verificationLabel: getStateLabel(verificationState),
    acceptedDocumentCount,
    rejectedDocumentCount,
    uploadedDocumentCount,
    requiredDocumentCount: REQUIRED_DOC_TYPES.length,
    progressLabel: `${acceptedDocumentCount} of ${REQUIRED_DOC_TYPES.length} documents accepted`,
    business: {
      id: business.id,
      name: business.name || "Unnamed shop",
      status: String(business.status || "PENDING").toUpperCase(),
      lifecycle_state: business.lifecycle_state || "ACTIVE",
      description: business.description || null,
      products_summary: business.products_summary || null,
      email: business.email || owner?.email || null,
      phone: business.phone || null,
      address: business.address || null,
      last_activity_at: business.last_activity_at || null,
      locked_at: business.locked_at || null,
      lock_reason: business.lock_reason || null,
      archived_at: business.archived_at || null,
    },
    owner: owner ? { id: owner.id, full_name: owner.full_name || null, email: owner.email || null } : null,
    documents,
    profile_change_requests: sortedProfileRequests.map((request) => ({ ...request, status: normalizeStatus(request.status) }))
      .slice(0, MAX_PROFILE_REQUESTS_PER_SHOP),
    profileChangeRequestCount: sortedProfileRequests.length,
    pendingProfileChangeCount: pendingProfileRequests.length,
    latestPendingProfileChange: latestPendingProfileChange ? {
      id: latestPendingProfileChange.id,
      requested_description: latestPendingProfileChange.requested_description || "",
      requested_products_summary: latestPendingProfileChange.requested_products_summary || "",
      reason: latestPendingProfileChange.reason || "",
      created_at: latestPendingProfileChange.created_at || null,
    } : null,
    latestDocumentDate,
  };
}

function shopMatchesSearch(shop, search) {
  if (!search) return true;
  return normalizeText(`${shop.shopName} ${shop.ownerName} ${shop.ownerEmail || ""}`).includes(search);
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const search = normalizeText(params.get("search"));
    const requestedFilter = String(params.get("status") || "ALL").toUpperCase();
    const filter = VALID_FILTERS.has(requestedFilter) ? requestedFilter : "ALL";
    const page = clampPage(params.get("page"));

    const businesses = await readRows(
      auth.supabase
        .from("businesses")
        .select("id, name, description, products_summary, status, created_at, owner_id, email, phone, address, lifecycle_state, last_activity_at, locked_at, lock_reason, archived_at")
        .order("created_at", { ascending: false })
        .range(0, MAX_BUSINESS_ROWS - 1),
    );
    const businessIds = businesses.map((business) => business.id).filter(Boolean);
    const ownerIds = [...new Set(businesses.map((business) => business.owner_id).filter(Boolean))];
    const [documents, profiles, profileRequests] = await Promise.all([
      businessIds.length > 0
        ? readRows(auth.supabase.from("business_documents").select("id, business_id, doc_type, file_url, file_name, file_size_bytes, file_type, file_format, quality_requirement, tin_number, status, admin_comment, owner_comment, created_at, updated_at").in("business_id", businessIds).order("created_at", { ascending: false }).range(0, MAX_DOCUMENT_ROWS - 1))
        : [],
      ownerIds.length > 0
        ? readRows(auth.supabase.from("profiles").select("id, full_name, email").in("id", ownerIds).range(0, MAX_BUSINESS_ROWS - 1))
        : [],
      businessIds.length > 0
        ? readRows(auth.supabase.from("business_profile_change_requests").select("id, business_id, requested_description, requested_products_summary, reason, status, admin_comment, created_at, reviewed_at").in("business_id", businessIds).order("created_at", { ascending: false }).range(0, MAX_PROFILE_REQUEST_ROWS - 1))
        : [],
    ]);

    const profileMap = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    const documentsByBusiness = documents.reduce((map, document) => {
      map[document.business_id] = [...(map[document.business_id] || []), document];
      return map;
    }, {});
    const profileRequestsByBusiness = profileRequests.reduce((map, profileRequest) => {
      map[profileRequest.business_id] = [...(map[profileRequest.business_id] || []), profileRequest];
      return map;
    }, {});
    const allShops = businesses.map((business) => buildShop(
      business,
      profileMap[business.owner_id],
      documentsByBusiness[business.id] || [],
      profileRequestsByBusiness[business.id] || [],
    ));
    const filteredShops = allShops
      .filter((shop) => shopMatchesSearch(shop, search) && matchesFilter(shop, filter))
      .sort((first, second) => String(second.latestDocumentDate || second.submissionDate || "").localeCompare(String(first.latestDocumentDate || first.submissionDate || "")));
    const { rows, pagination } = paginate(filteredShops, page);

    const totals = allShops.reduce((summary, shop) => {
      summary.total += 1;
      summary[shop.verificationState] += 1;
      summary.acceptedDocuments += shop.acceptedDocumentCount;
      summary.rejectedDocuments += shop.rejectedDocumentCount;
      summary.pendingProfileChangeRequests += shop.pendingProfileChangeCount;
      return summary;
    }, {
      total: 0,
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      READY_FOR_APPROVAL: 0,
      APPROVED: 0,
      REJECTED: 0,
      acceptedDocuments: 0,
      rejectedDocuments: 0,
      pendingProfileChangeRequests: 0,
    });

    return NextResponse.json({
      shops: rows,
      pagination,
      totals: {
        ...totals,
        pending: totals.NOT_STARTED + totals.IN_PROGRESS + totals.READY_FOR_APPROVAL,
        partiallyReviewed: totals.IN_PROGRESS,
        approved: totals.APPROVED,
        rejected: totals.REJECTED,
      },
      truncated: {
        businesses: businesses.length === MAX_BUSINESS_ROWS,
        documents: documents.length === MAX_DOCUMENT_ROWS,
        profileRequests: profileRequests.length === MAX_PROFILE_REQUEST_ROWS,
      },
    });
  } catch (error) {
    console.error("ADMIN_VERIFICATIONS_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_VERIFICATIONS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").toUpperCase();
    const businessId = String(body.businessId || "").trim();
    if (!businessId) return NextResponse.json({ error: "INVALID_VERIFICATION_TARGET" }, { status: 400 });

    if (action === "DOCUMENT") {
      const documentId = String(body.documentId || "").trim();
      const status = String(body.status || "").toUpperCase();
      const adminComment = String(body.adminComment || "").trim().slice(0, 500);
      if (!documentId || !ACTION_STATUSES.has(status)) {
        return NextResponse.json({ error: "INVALID_DOCUMENT_ACTION" }, { status: 400 });
      }

      const { data: document, error } = await auth.supabase
        .from("business_documents")
        .update({ status, admin_comment: adminComment || null })
        .eq("id", documentId)
        .eq("business_id", businessId)
        .select("id, business_id, doc_type, file_url, file_name, file_size_bytes, file_type, file_format, quality_requirement, tin_number, status, admin_comment, owner_comment, created_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!document) return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ document });
    }

    if (action === "SHOP") {
      const shopAction = String(body.shopAction || body.status || "").toUpperCase();
      if (!["APPROVED", "REJECTED", "REVOKE"].includes(shopAction)) {
        return NextResponse.json({ error: "INVALID_SHOP_APPROVAL_ACTION" }, { status: 400 });
      }

      if (shopAction === "REVOKE") {
        const { data: result, error } = await auth.supabase.rpc("admin_revoke_business_verification", {
          p_business_id: businessId,
          p_requester_id: auth.user.id,
        });
        if (error) throw error;
        return NextResponse.json({ success: true, business: result });
      }

      if (shopAction === "APPROVED") {
        const { data: requiredDocuments, error: documentsError } = await auth.supabase
          .from("business_documents")
          .select("doc_type, status")
          .eq("business_id", businessId)
          .in("doc_type", REQUIRED_DOC_TYPES);
        if (documentsError) throw documentsError;

        const allApproved = REQUIRED_DOC_TYPES.every((type) => requiredDocuments?.some((document) => document.doc_type === type && document.status === "APPROVED"));
        if (!allApproved) {
          return NextResponse.json({ error: "ALL_REQUIRED_DOCUMENTS_MUST_BE_APPROVED" }, { status: 409 });
        }
      }

      const { data: result, error } = await auth.supabase.rpc("admin_set_business_status", {
        p_business_id: businessId,
        p_action: shopAction === "APPROVED" ? "APPROVE" : "REJECT",
        p_requester_id: auth.user.id,
      });
      if (error) throw error;
      return NextResponse.json({ success: true, business: result });
    }

    if (action === "PROFILE") {
      const requestId = String(body.requestId || "").trim();
      const status = String(body.status || "").toUpperCase();
      const adminComment = String(body.adminComment || "").trim().slice(0, 500);
      if (!requestId || !PROFILE_STATUSES.has(status)) {
        return NextResponse.json({ error: "INVALID_PROFILE_REQUEST_ACTION" }, { status: 400 });
      }

      const { data: profileRequest, error: requestError } = await auth.supabase
        .from("business_profile_change_requests")
        .select("id, business_id, requested_description, requested_products_summary, reason, status, admin_comment, created_at, reviewed_at")
        .eq("id", requestId)
        .eq("business_id", businessId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (!profileRequest) return NextResponse.json({ error: "PROFILE_REQUEST_NOT_FOUND" }, { status: 404 });

      if (status === "APPROVED") {
        const { error: businessError } = await auth.supabase
          .from("businesses")
          .update({ description: profileRequest.requested_description, products_summary: profileRequest.requested_products_summary })
          .eq("id", businessId);
        if (businessError) throw businessError;
      }

      const reviewedAt = status === "PENDING" ? null : new Date().toISOString();
      const { data: updatedRequest, error: updateError } = await auth.supabase
        .from("business_profile_change_requests")
        .update({ status, admin_comment: adminComment || null, reviewed_at: reviewedAt })
        .eq("id", requestId)
        .eq("business_id", businessId)
        .select("id, business_id, requested_description, requested_products_summary, reason, status, admin_comment, created_at, reviewed_at")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedRequest) return NextResponse.json({ error: "PROFILE_REQUEST_NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ request: updatedRequest });
    }

    if (action === "PROFILE_COMMENT") {
      const requestId = String(body.requestId || "").trim();
      const adminComment = String(body.adminComment || "").trim().slice(0, 500);
      if (!requestId) {
        return NextResponse.json({ error: "INVALID_PROFILE_COMMENT_ACTION" }, { status: 400 });
      }

      const { data: updatedRequest, error: updateError } = await auth.supabase
        .from("business_profile_change_requests")
        .update({ admin_comment: adminComment || null })
        .eq("id", requestId)
        .eq("business_id", businessId)
        .select("id, business_id, requested_description, requested_products_summary, reason, status, admin_comment, created_at, reviewed_at")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedRequest) return NextResponse.json({ error: "PROFILE_REQUEST_NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ request: updatedRequest });
    }

    return NextResponse.json({ error: "INVALID_VERIFICATION_ACTION" }, { status: 400 });
  } catch (error) {
    console.error("ADMIN_VERIFICATION_UPDATE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    if (error?.code === "23505") {
      return NextResponse.json({ error: "PROFILE_REQUEST_ALREADY_PENDING" }, { status: 409 });
    }
    return NextResponse.json({ error: "ADMIN_VERIFICATION_UPDATE_FAILED" }, { status: 500 });
  }
}
