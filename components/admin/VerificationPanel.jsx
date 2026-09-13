"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resolveStorageUrl } from "@/lib/imageUpload";
import {
  AlertCircle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  FileCheck2,
  FileWarning,
  Info,
  Loader2,
  Lock,
  MessageSquareText,
  RefreshCcw,
  Search,
  Unlock,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

const DOC_META = {
  DTI: { label: "DTI Certificate" },
  MAYORS_PERMIT: { label: "Mayor's Permit" },
  BIR: { label: "BIR Certificate" },
  VALID_ID: { label: "Valid ID" },
};
const REQUIRED_DOC_TYPES = Object.keys(DOC_META);
const IMAGE_DOCUMENT_PATTERN = /\.(jpeg|jpg|png|webp|gif|svg)$/i;

function isImageDocumentUrl(value) {
  return IMAGE_DOCUMENT_PATTERN.test(String(value || "").split(/[?#]/)[0]);
}

function formatDate(value, options = {}) {
  if (!value) return "Not recorded";
  try {
    return new Date(value).toLocaleDateString(undefined, options);
  } catch {
    return "Not recorded";
  }
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "Not recorded";
  }
}

function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return "Size not stored";
  return `${(Number(bytes) / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileName(document) {
  if (document?.file_name) return document.file_name;
  if (!document?.file_url) return "Uploaded document";
  try {
    return decodeURIComponent(String(document.file_url).split("/").pop() || "Uploaded document");
  } catch {
    return "Uploaded document";
  }
}

function getFileFormat(document) {
  if (document?.file_format) return String(document.file_format).toUpperCase();
  if (document?.file_type) return String(document.file_type).split("/").pop().toUpperCase();
  const source = document?.file_name || document?.file_url || "";
  return source.includes(".") ? source.split(".").pop().toUpperCase() : "Unknown";
}

function stateClass(state) {
  return {
    APPROVED: "bg-emerald-100 text-emerald-800",
    READY_FOR_APPROVAL: "bg-[#00FFFF]/25 text-[#007C7D]",
    REJECTED: "bg-rose-100 text-rose-800",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    NOT_STARTED: "bg-slate-200 text-slate-700",
  }[state] || "bg-slate-200 text-slate-700";
}

function documentClass(status, hasDocument) {
  if (!hasDocument) return "bg-slate-100 text-slate-600";
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function deriveVerificationState(businessStatus, documents) {
  if (documents.some((document) => document.status === "REJECTED")) return "REJECTED";

  const acceptedDocumentCount = documents.filter((document) => document.status === "APPROVED").length;
  const hasSubmittedDocument = documents.some((document) => document.id || document.status === "APPROVED");
  const allDocumentsApproved = REQUIRED_DOC_TYPES.every((type) => documents.some(
    (document) => document.doc_type === type && document.status === "APPROVED",
  ));
  if (allDocumentsApproved && businessStatus === "APPROVED") return "APPROVED";
  if (allDocumentsApproved) return "READY_FOR_APPROVAL";
  if (acceptedDocumentCount > 0 || hasSubmittedDocument) return "IN_PROGRESS";
  return "NOT_STARTED";
}

function updateShopDocumentState(shop, documents) {
  const acceptedDocumentCount = documents.filter((document) => document.status === "APPROVED").length;
  const rejectedDocumentCount = documents.filter((document) => document.status === "REJECTED").length;
  const uploadedDocumentCount = documents.filter((document) => document.id).length;
  const verificationState = deriveVerificationState(shop.business?.status, documents);
  return {
    ...shop,
    business: shop.business?.status === "APPROVED" && verificationState === "REJECTED"
      ? { ...shop.business, status: "PENDING" }
      : shop.business,
    documents,
    verificationState,
    verificationLabel: {
      APPROVED: "Approved",
      READY_FOR_APPROVAL: "Ready for approval",
      REJECTED: "Needs changes",
      IN_PROGRESS: "In progress",
      NOT_STARTED: "Not started",
    }[verificationState],
    acceptedDocumentCount,
    rejectedDocumentCount,
    uploadedDocumentCount,
    progressLabel: acceptedDocumentCount + " of " + REQUIRED_DOC_TYPES.length + " documents accepted",
  };
}

function verificationBuckets(state) {
  return {
    pending: ["NOT_STARTED", "IN_PROGRESS", "READY_FOR_APPROVAL"].includes(state) ? 1 : 0,
    partiallyReviewed: state === "IN_PROGRESS" ? 1 : 0,
    READY_FOR_APPROVAL: state === "READY_FOR_APPROVAL" ? 1 : 0,
    approved: state === "APPROVED" ? 1 : 0,
    rejected: state === "REJECTED" ? 1 : 0,
  };
}

function DocumentStatusIcon({ status, hasDocument }) {
  if (!hasDocument) return <FileWarning size={14} aria-hidden="true" />;
  if (status === "APPROVED") return <CheckCircle2 size={14} aria-hidden="true" />;
  if (status === "REJECTED") return <XCircle size={14} aria-hidden="true" />;
  return <Clock3 size={14} aria-hidden="true" />;
}

function Pager({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
      <p className="text-slate-500">Page <strong className="text-slate-800">{pagination.page}</strong> of <strong className="text-slate-800">{pagination.totalPages}</strong> · {pagination.totalItems} shops</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onPageChange(pagination.page - 1)} disabled={pagination.page <= 1} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <button type="button" onClick={() => onPageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="rounded-lg bg-[#1A1A1A] px-3 py-2 font-bold text-white hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose, labelledBy }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-surface w-full max-w-lg p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={labelledBy} className="text-lg font-black text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function VerificationProfileRequestActions({ shop, request, actionLoading, onCommentChange, handleProfileRequestAction, saveProfileComment }) {
  const actionKey = `profile-${request.id}`;
  const commentKey = `profile-comment-${request.id}`;
  const isPending = request.status === "PENDING";
  return <div className="mt-3 space-y-2"><label htmlFor={`verification-profile-comment-${request.id}`} className="sr-only">Admin comment</label><input id={`verification-profile-comment-${request.id}`} type="text" value={request.admin_comment || ""} onChange={(event) => onCommentChange(event.target.value)} maxLength={500} placeholder="Optional note for the owner..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00C7C7]" /><div className="flex flex-wrap gap-2">{isPending ? <><button type="button" onClick={() => handleProfileRequestAction(shop, request, "APPROVED")} disabled={actionLoading[actionKey]} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Approve and apply</button><button type="button" onClick={() => handleProfileRequestAction(shop, request, "REJECTED")} disabled={actionLoading[actionKey]} className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">Reject request</button></> : <><button type="button" onClick={() => saveProfileComment(shop, request, request.admin_comment || "")} disabled={actionLoading[commentKey]} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#EC008C] hover:text-[#EC008C] disabled:opacity-50">Save comment</button>{request.status === "REJECTED" && <button type="button" onClick={() => handleProfileRequestAction(shop, request, "PENDING")} disabled={actionLoading[actionKey]} className="flex-1 rounded-lg border border-[#00C7C7] bg-[#00C7C7]/10 px-3 py-2 text-xs font-bold text-[#007C7D] hover:bg-[#00C7C7]/20 disabled:opacity-50">Reopen for review</button>}</>}</div>{request.status === "APPROVED" && <p className="text-[10px] leading-relaxed text-slate-500">Approved profile values are already applied. Submit a new owner request for another change.</p>}</div>;
}

function ProfileChangeRequestsSummary({ shops, totalCount, onOpen }) {
  const requests = shops.flatMap((shop) => (shop.profile_change_requests || [])
    .filter((request) => request.status === "PENDING")
    .map((request) => ({ shop, request })));
  if (totalCount === 0 && requests.length === 0) return null;
  return <section className="mx-auto mb-5 w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 border border-[#EC008C]/25 bg-[#FFF7FB] p-4" aria-labelledby="pending-profile-requests-heading"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><MessageSquareText size={16} className="text-[#C40075]" aria-hidden="true" /><h2 id="pending-profile-requests-heading" className="text-sm font-black text-slate-900">Profile change requests</h2></div><span className="rounded-full bg-[#EC008C]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#C40075]">{totalCount || requests.length} pending</span></div><p className="mt-1 text-xs text-slate-600">Review requested shop profile updates here. Open a shop below to see the full request and add comments.</p>{requests.length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-2">{requests.map(({ shop, request }) => <article key={request.id} className="border border-[#EC008C]/20 bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{shop.shopName}</p><p className="mt-1 text-[10px] text-slate-500">Requested {formatDateTime(request.created_at)}</p></div><button type="button" onClick={() => onOpen(shop.shopId)} className="shrink-0 rounded-lg border border-[#EC008C]/30 px-2.5 py-1.5 text-[10px] font-black text-[#C40075] hover:bg-[#FFF7FB]">Open request</button></div><p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-700">{request.reason || "Owner requested a profile update."}</p><div className="mt-2 grid gap-1 text-[10px] leading-relaxed text-slate-600 sm:grid-cols-2"><p><strong>Background:</strong> {request.requested_description || "No change provided."}</p><p><strong>Products:</strong> {request.requested_products_summary || "No change provided."}</p></div></article>)}</div>}{totalCount > requests.length && <p className="mt-3 text-[10px] font-semibold text-slate-500">More pending requests are available on another verification page.</p>}</section>;
}

export default function VerificationPanel() {
  const [shops, setShops] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, totalItems: 0, totalPages: 1 });
  const [totals, setTotals] = useState({ total: 0, pending: 0, partiallyReviewed: 0, approved: 0, rejected: 0, pendingProfileChangeRequests: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [reviewingDocIds, setReviewingDocIds] = useState({});
  const [adminComments, setAdminComments] = useState({});
  const [rejectingDocument, setRejectingDocument] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvalShop, setApprovalShop] = useState(null);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState(null);
  const activeRequest = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => () => {
    activeRequest.current?.abort();
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
    return session.access_token;
  }, []);

  const fetchVerifications = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ page: String(page), status: statusFilter });
      if (search) params.set("search", search);
      const response = await fetch(`/api/admin/verifications?${params.toString()}`, { cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Verification data is unavailable.");
      if (controller.signal.aborted) return;
      setShops(payload.shops || []);
      setPagination(payload.pagination || { page: 1, pageSize: 15, totalItems: 0, totalPages: 1 });
      setTotals(payload.totals || { total: 0, pending: 0, partiallyReviewed: 0, approved: 0, rejected: 0, pendingProfileChangeRequests: 0 });
    } catch (loadError) {
      if (loadError.name === "AbortError") return;
      setShops([]);
      setError(loadError.message || "We could not load verification data.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [getAccessToken, page, search, statusFilter]);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  const callMutation = useCallback(async (body) => {
    const token = await getAccessToken();
    const response = await fetch("/api/admin/verifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The verification action could not be completed.");
    return payload;
  }, [getAccessToken]);

  const patchShop = (shopId, updater) => {
    setShops((current) => current.map((shop) => shop.shopId === shopId ? updater(shop) : shop));
  };

  const updateVerificationTotals = (previousShop, nextShop) => {
    if (!previousShop || !nextShop || previousShop.verificationState === nextShop.verificationState) return;
    const previousBuckets = verificationBuckets(previousShop.verificationState);
    const nextBuckets = verificationBuckets(nextShop.verificationState);
    setTotals((current) => Object.keys(nextBuckets).reduce((updatedTotals, key) => ({
      ...updatedTotals,
      [key]: Math.max(0, (updatedTotals[key] || 0) - previousBuckets[key] + nextBuckets[key]),
    }), current));
  };

  const handleDocumentAction = async (shop, document, status, comment) => {
    if (!document?.id) return;
    const actionKey = `document-${document.id}`;
    setActionLoading((current) => ({ ...current, [actionKey]: true }));
    try {
      const payload = await callMutation({ action: "DOCUMENT", businessId: shop.shopId, documentId: document.id, status, adminComment: comment ?? adminComments[document.id] ?? document.admin_comment ?? "" });
      const updatedDocument = payload.document;
      const nextDocuments = shop.documents.map((item) => item.id === updatedDocument.id ? { ...item, ...updatedDocument } : item);
      const nextShop = updateShopDocumentState(shop, nextDocuments);
      patchShop(shop.shopId, (currentShop) => updateShopDocumentState(
        currentShop,
        currentShop.documents.map((item) => item.id === updatedDocument.id ? { ...item, ...updatedDocument } : item),
      ));
      updateVerificationTotals(shop, nextShop);
      setReviewingDocIds((current) => ({ ...current, [document.id]: false }));
      showToast(status === "APPROVED" ? `${document.label} accepted.` : `${document.label} rejected.`);
    } catch (actionError) {
      showToast(actionError.message || "The document could not be updated.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const openRejectForm = (shop, document) => {
    setRejectingDocument({ shopId: shop.shopId, documentId: document.id, label: document.label });
    setRejectReason(document.admin_comment || "");
  };

  const submitRejection = async (event) => {
    event.preventDefault();
    const reason = rejectReason.trim();
    if (reason.length < 5) return;
    const shop = shops.find((item) => item.shopId === rejectingDocument?.shopId);
    const document = shop?.documents?.find((item) => item.id === rejectingDocument?.documentId);
    if (!shop || !document) return;
    await handleDocumentAction(shop, document, "REJECTED", reason);
    setRejectingDocument(null);
    setRejectReason("");
  };

  const approveShop = async () => {
    if (!approvalShop) return;
    const actionKey = `shop-${approvalShop.shopId}`;
    setActionLoading((current) => ({ ...current, [actionKey]: true }));
    try {
      await callMutation({ action: "SHOP", businessId: approvalShop.shopId, status: "APPROVED" });
      const nextShop = { ...approvalShop, verificationState: "APPROVED", verificationLabel: "Approved", business: { ...approvalShop.business, status: "APPROVED" } };
      patchShop(approvalShop.shopId, () => nextShop);
      updateVerificationTotals(approvalShop, nextShop);
      setApprovalShop(null);
      showToast(`${approvalShop.shopName} is now approved.`);
    } catch (actionError) {
      showToast(actionError.message || "The shop could not be approved. You can retry.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const revokeShopApproval = async (shop) => {
    if (!shop || !window.confirm(`Revoke approval for ${shop.shopName}? This will lock the shop, remove it from customer visibility, and reset all four document decisions to pending.`)) return;
    const actionKey = `shop-revoke-${shop.shopId}`;
    setActionLoading((current) => ({ ...current, [actionKey]: true }));
    try {
      await callMutation({ action: "SHOP", businessId: shop.shopId, shopAction: "REVOKE" });
      const resetDocuments = shop.documents.map((document) => ({
        ...document,
        status: "PENDING",
        admin_comment: null,
        updated_at: new Date().toISOString(),
      }));
      setReviewingDocIds((current) => {
        const next = { ...current };
        shop.documents.forEach((document) => {
          if (document.id) next[document.id] = false;
        });
        return next;
      });
      setAdminComments((current) => {
        const next = { ...current };
        shop.documents.forEach((document) => {
          if (document.id) delete next[document.id];
        });
        return next;
      });
      const nextShop = updateShopDocumentState(
        { ...shop, business: { ...shop.business, status: "REJECTED" } },
        resetDocuments,
      );
      patchShop(shop.shopId, () => nextShop);
      updateVerificationTotals(shop, nextShop);
      showToast(`${shop.shopName} approval was revoked. All four documents are pending review again.`);
    } catch (actionError) {
      showToast(actionError.message || "The shop approval could not be revoked.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const handleProfileRequestAction = async (shop, request, status) => {
    const actionKey = `profile-${request.id}`;
    setActionLoading((current) => ({ ...current, [actionKey]: true }));
    try {
      const payload = await callMutation({ action: "PROFILE", businessId: shop.shopId, requestId: request.id, status, adminComment: request.admin_comment || "" });
      patchShop(shop.shopId, (currentShop) => ({
        ...currentShop,
        business: status === "APPROVED" ? { ...currentShop.business, description: request.requested_description, products_summary: request.requested_products_summary } : currentShop.business,
        profile_change_requests: currentShop.profile_change_requests.map((item) => item.id === request.id ? { ...item, ...payload.request } : item),
      }));
      const pendingDelta = (status === "PENDING" ? 1 : 0) - (request.status === "PENDING" ? 1 : 0);
      if (pendingDelta !== 0) {
        setTotals((current) => ({ ...current, pendingProfileChangeRequests: Math.max(0, (current.pendingProfileChangeRequests || 0) + pendingDelta) }));
      }
      showToast(status === "APPROVED" ? "Profile change request approved." : status === "REJECTED" ? "Profile change request rejected." : "Profile change request reopened for review.");
    } catch (actionError) {
      showToast(actionError.message || "The profile request could not be updated.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const saveProfileComment = async (shop, request, comment) => {
    const actionKey = `profile-comment-${request.id}`;
    setActionLoading((current) => ({ ...current, [actionKey]: true }));
    try {
      const payload = await callMutation({ action: "PROFILE_COMMENT", businessId: shop.shopId, requestId: request.id, adminComment: comment });
      patchShop(shop.shopId, (currentShop) => ({
        ...currentShop,
        profile_change_requests: currentShop.profile_change_requests.map((item) => item.id === request.id ? { ...item, ...payload.request } : item),
      }));
      showToast("Admin comment saved.");
    } catch (actionError) {
      showToast(actionError.message || "The profile request comment could not be saved.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const handleLifecycleAction = async (shop, action) => {
    const labels = { LOCK: "lock this shop", UNLOCK: "unlock this shop", ARCHIVE: "archive this shop" };
    const warning = action === "ARCHIVE" ? "Archiving hides the shop from customers while preserving historical records." : action === "LOCK" ? "Locking hides the shop and stops new customer orders." : "Unlocking makes the approved shop visible again.";
    if (!window.confirm(`Are you sure you want to ${labels[action]}?\n\n${warning}`)) return;
    const actionKey = `lifecycle-${shop.shopId}`;
    setActionLoading((current) => ({ ...current, [actionKey]: true }));
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/shops/lifecycle", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ businessId: shop.shopId, action, reason: action === "LOCK" ? "Manually locked by an administrator" : undefined }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The shop lifecycle could not be updated.");
      const nextState = payload.result?.lifecycle_state || (action === "LOCK" ? "LOCKED" : action === "ARCHIVE" ? "ARCHIVED" : "ACTIVE");
      patchShop(shop.shopId, (currentShop) => ({ ...currentShop, business: { ...currentShop.business, lifecycle_state: nextState, lock_reason: action === "LOCK" ? "Manually locked by an administrator" : currentShop.business.lock_reason } }));
      showToast(`Shop ${action.toLowerCase()} action completed.`);
    } catch (actionError) {
      showToast(actionError.message || "The shop lifecycle could not be updated.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const openDocument = async (document) => {
    setPreview({ document, loading: true, url: null });
    const url = await resolveStorageUrl(document?.file_url);
    if (!url) {
      setPreview(null);
      showToast("This document is unavailable or access was denied.", "error");
      return;
    }
    setPreview({ document, loading: false, url });
  };

  return (
    <>
      {preview && <Modal title="Document preview" labelledBy="verification-document-preview" onClose={() => setPreview(null)}>{preview.loading ? <div className="flex min-h-64 items-center justify-center text-[#EC008C]"><Loader2 size={28} className="animate-spin" /></div> : <div className="space-y-3"><div className="flex items-center justify-between gap-3 text-xs"><p className="truncate font-bold text-slate-900">{getFileName(preview.document)}</p><span className="shrink-0 text-slate-500">{getFileFormat(preview.document)}</span></div>{isImageDocumentUrl(preview.url) ? <div className="flex max-h-[calc(92vh-10rem)] min-h-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2"><img src={preview.url} alt={`${preview.document.label} document preview`} className="block max-h-[calc(92vh-10rem)] max-w-full object-contain" /></div> : <iframe src={preview.url} title={`${preview.document.label} document preview`} className="h-[calc(92vh-10rem)] min-h-80 w-full rounded-xl border border-slate-200" />}</div>}</Modal>}

      {rejectingDocument && <Modal title={`Reject ${rejectingDocument.label}`} labelledBy="reject-verification-document" onClose={() => setRejectingDocument(null)}><form onSubmit={submitRejection} className="space-y-4"><p className="border-l-2 border-[#EC008C] pl-3 text-xs leading-relaxed text-slate-600">Tell the Business Owner what needs to be corrected before they upload this document again.</p><div><label htmlFor="verification-rejection-reason" className="mb-1.5 block text-xs font-bold text-slate-800">Reason or feedback <span className="text-[#EC008C]">*</span></label><textarea id="verification-rejection-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} minLength={5} maxLength={500} required rows={4} autoFocus placeholder="Example: Please upload a sharper, fully visible copy." className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#EC008C] focus:ring-2 focus:ring-[#EC008C]/20" /><p className="mt-1 text-right text-[10px] text-slate-400">{rejectReason.length}/500</p></div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setRejectingDocument(null)} className="rounded-full border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Cancel</button><button type="submit" disabled={rejectReason.trim().length < 5 || actionLoading[`document-${rejectingDocument.documentId}`]} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#EC008C] px-4 py-2.5 text-xs font-black text-white hover:bg-[#C40075] disabled:cursor-not-allowed disabled:opacity-50">Reject document</button></div></form></Modal>}

      {approvalShop && <Modal title="Approve this shop?" labelledBy="approve-verification-shop" onClose={() => { if (!actionLoading[`shop-${approvalShop.shopId}`]) setApprovalShop(null); }}><div className="space-y-4"><div className="border-l-4 border-[#00C7C7] bg-[#00FFFF]/10 p-4"><p className="text-sm font-black text-slate-900">{approvalShop.shopName}</p><p className="mt-1 text-xs text-slate-600">All four required documents have been accepted.</p></div><p className="text-sm leading-relaxed text-slate-700">Are you sure you want to approve this shop? All required documents have been accepted. Approving this shop will make it eligible for the approved Business Owner workflow.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setApprovalShop(null)} disabled={actionLoading[`shop-${approvalShop.shopId}`]} className="rounded-full border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="button" onClick={approveShop} disabled={actionLoading[`shop-${approvalShop.shopId}`]} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white hover:bg-[#00A878] disabled:cursor-not-allowed disabled:opacity-50">{actionLoading[`shop-${approvalShop.shopId}`] && <Loader2 size={14} className="animate-spin" />} Approve shop</button></div></div></Modal>}

      {toast && <div className={`fixed bottom-6 right-6 z-[200] max-w-sm rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg ${toast.type === "error" ? "bg-rose-700" : "bg-slate-900"}`} role="status" aria-live="polite">{toast.message}</div>}

      <main className="admin-page min-h-screen overflow-x-hidden bg-[#F6F6F2] pb-24 font-sans text-slate-900">
        <section className="relative overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="cmyk-bar absolute left-0 right-0 top-0" /><div className="mx-auto flex max-w-[1600px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FFFF]">Admin workspace</p><h1 className="text-3xl font-black uppercase tracking-tight text-white">Verifications</h1><p className="mt-2 max-w-2xl text-xs text-white/65">Review each shop's documents, request changes, and approve a shop only when every required file is accepted.</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-3 py-2 text-[11px] font-black text-[#FFF200]">{totals.pending || 0} pending</span><button type="button" onClick={fetchVerifications} disabled={loading} className="inline-flex items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"><RefreshCcw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button></div></div></section><ProfileChangeRequestsSummary shops={shops} totalCount={totals.pendingProfileChangeRequests || 0} onOpen={setExpandedId} />

        <section className="mx-auto max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8"><div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Verification totals"><div className="border-l-4 border-[#FFF200] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pending</p><p className="mt-1 text-xl font-black">{totals.pending || 0}</p></div><div className="border-l-4 border-amber-400 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Partially reviewed</p><p className="mt-1 text-xl font-black">{totals.partiallyReviewed || 0}</p></div><div className="border-l-4 border-[#00C7C7] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ready / approved</p><p className="mt-1 text-xl font-black">{(totals.READY_FOR_APPROVAL || 0) + (totals.approved || 0)}</p></div><div className="border-l-4 border-emerald-400 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Approved shops</p><p className="mt-1 text-xl font-black">{totals.approved || 0}</p></div><div className="border-l-4 border-[#EC008C] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Needs changes</p><p className="mt-1 text-xl font-black">{totals.rejected || 0}</p></div></div><div className="mb-5 grid grid-cols-1 gap-3 border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_240px]"><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Search shop, owner, or email<span className="relative mt-1 block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} placeholder="Search verification requests..." aria-label="Search shop, owner, or email" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-[#00C7C7] focus:bg-white" /></span></label><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Review state<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); setExpandedId(null); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-[#00C7C7] focus:bg-white"><option value="ALL">All shops</option><option value="PENDING">Pending</option><option value="PARTIALLY_REVIEWED">Partially reviewed</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected / needs changes</option></select></label></div>{error && <div className="mb-4 flex flex-col gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 sm:flex-row sm:items-center" role="alert"><AlertCircle size={16} className="shrink-0" /><span>{error}</span><button type="button" onClick={fetchVerifications} className="font-black underline sm:ml-auto">Retry</button></div>}

          {loading ? <div className="flex min-h-72 items-center justify-center border border-dashed border-slate-300 bg-white"><div className="flex flex-col items-center gap-3 text-slate-500"><Loader2 size={30} className="animate-spin text-[#EC008C]" /><p className="text-xs font-bold">Loading verification shops...</p></div></div> : shops.length === 0 ? <div className="border border-dashed border-slate-300 bg-white p-12 text-center"><FileCheck2 size={32} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-black text-slate-700">No shops match this view</p><p className="mt-1 text-xs text-slate-500">Try another search or review state. New submissions will appear here after refresh.</p></div> : <div className="space-y-4">{shops.map((shop) => { const isExpanded = expandedId === shop.shopId; const lifecycle = shop.business?.lifecycle_state || "ACTIVE"; const lifecycleKey = `lifecycle-${shop.shopId}`; const isReviewingAnyDocument = shop.documents.some((document) => document.id && reviewingDocIds[document.id]); const displayedVerificationState = isReviewingAnyDocument ? "IN_PROGRESS" : shop.verificationState; const displayedVerificationLabel = isReviewingAnyDocument ? "Pending review" : shop.verificationLabel; const canApproveShop = shop.verificationState === "READY_FOR_APPROVAL" && shop.business?.status !== "APPROVED" && !isReviewingAnyDocument; return <article key={shop.shopId} className="border border-slate-200 bg-white shadow-sm"><div className="flex items-start gap-4 p-4 sm:p-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-black text-slate-900">{shop.shopName}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${stateClass(displayedVerificationState)}`}>{displayedVerificationLabel}</span>{shop.business?.status === "APPROVED" && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800">Verified Partner</span>}</div><p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500"><UserRound size={13} aria-hidden="true" /> Owner: <strong className="text-slate-700">{shop.ownerName}</strong> · {shop.ownerEmail || "Email not available"}</p><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500"><span><strong className="text-slate-800">Submitted:</strong> {formatDate(shop.submissionDate, { month: "short", day: "numeric", year: "numeric" })}</span><span><strong className="text-slate-800">Progress:</strong> {shop.progressLabel}</span><span><strong className="text-slate-800">Uploaded:</strong> {shop.uploadedDocumentCount}/4</span></div><div className="mt-3 h-2 max-w-xl overflow-hidden rounded-full bg-slate-100" aria-label={shop.progressLabel}><div className={`h-full ${shop.verificationState === "REJECTED" ? "bg-[#EC008C]" : shop.verificationState === "APPROVED" ? "bg-emerald-500" : "bg-[#00C7C7]"}`} style={{ width: `${Math.round((shop.acceptedDocumentCount / 4) * 100)}%` }} /></div></div><button type="button" aria-expanded={isExpanded} aria-label={`${isExpanded ? "Collapse" : "Expand"} verification details for ${shop.shopName}`} onClick={() => setExpandedId(isExpanded ? null : shop.shopId)} className="shrink-0 rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">{isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button></div><div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-4 sm:px-5">{shop.documents.map((document) => <div key={document.doc_type} className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-bold ${documentClass(document.status, Boolean(document.id))}`}><DocumentStatusIcon status={document.status} hasDocument={Boolean(document.id)} /><span className="truncate">{document.label}</span><span className="ml-auto shrink-0">{document.id ? document.status : "Missing"}</span></div>)}</div>{isExpanded && <div className="space-y-5 border-t border-slate-200 bg-[#FAFAF7] p-4 sm:p-5"><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><div className="border-l-2 border-[#00C7C7] bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#008F91]">Shop status</p><p className="mt-1 text-xs font-bold text-slate-800">{shop.business?.status || "PENDING"}</p><p className="mt-1 text-[11px] text-slate-500">{shop.business?.lifecycle_state || "ACTIVE"}</p></div><div className="border-l-2 border-[#FFF200] bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8A8200]">Business background</p><p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">{shop.business?.description || "Not provided"}</p></div><div className="border-l-2 border-[#EC008C] bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#C40075]">Products &amp; services</p><p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">{shop.business?.products_summary || "Not provided"}</p></div></div>

          {shop.business?.status === "APPROVED" && <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => revokeShopApproval(shop)} disabled={actionLoading[`shop-revoke-${shop.shopId}`]} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-rose-700 hover:bg-rose-100 disabled:opacity-50">Revoke approval</button>{lifecycle === "ACTIVE" && <button type="button" onClick={() => handleLifecycleAction(shop, "LOCK")} disabled={actionLoading[lifecycleKey]} className="inline-flex items-center gap-1.5 rounded-lg border border-[#D1C500] bg-[#FFF200]/20 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#756D00] hover:bg-[#FFF200] disabled:opacity-50"><Lock size={12} /> Lock shop</button>}{lifecycle === "LOCKED" && <button type="button" onClick={() => handleLifecycleAction(shop, "UNLOCK")} disabled={actionLoading[lifecycleKey]} className="inline-flex items-center gap-1.5 rounded-lg border border-[#00AFC0] bg-[#00FFFF]/15 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#007C7D] hover:bg-[#00FFFF] disabled:opacity-50"><Unlock size={12} /> Unlock shop</button>}{lifecycle !== "ARCHIVED" && <button type="button" onClick={() => handleLifecycleAction(shop, "ARCHIVE")} disabled={actionLoading[lifecycleKey]} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 hover:bg-slate-100 disabled:opacity-50"><Archive size={12} /> Archive shop</button>}{lifecycle !== "ACTIVE" && <span className="text-[11px] text-slate-500">Last activity: {formatDateTime(shop.business?.last_activity_at)}{shop.business?.lock_reason ? ` · ${shop.business.lock_reason}` : ""}</span>}</div>}

          {shop.profile_change_requests?.length > 0 && <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Profile change requests</h3><span className="text-[10px] text-slate-400">{shop.profile_change_requests.length} shown</span></div>{shop.profile_change_requests.map((request) => { return <article key={request.id} className="border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-slate-900">Requested {formatDate(request.created_at)}</p><p className="mt-1 text-[11px] text-slate-500">Reason: {request.reason || "Not provided"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${request.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : request.status === "REJECTED" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{request.status}</span></div><div className="mt-3 grid grid-cols-1 gap-2 text-[11px] md:grid-cols-2"><div className="border border-slate-200 bg-slate-50 p-3"><p className="font-black uppercase tracking-[0.1em] text-[#008F91]">Requested background</p><p className="mt-1 leading-relaxed text-slate-600">{request.requested_description}</p></div><div className="border border-slate-200 bg-slate-50 p-3"><p className="font-black uppercase tracking-[0.1em] text-[#8A8200]">Requested products</p><p className="mt-1 leading-relaxed text-slate-600">{request.requested_products_summary}</p></div></div><VerificationProfileRequestActions shop={shop} request={request} actionLoading={actionLoading} onCommentChange={(value) => patchShop(shop.shopId, (currentShop) => ({ ...currentShop, profile_change_requests: currentShop.profile_change_requests.map((item) => item.id === request.id ? { ...item, admin_comment: value } : item) }))} handleProfileRequestAction={handleProfileRequestAction} saveProfileComment={saveProfileComment} /></article>; })}</section>}

          <section aria-labelledby={`documents-${shop.shopId}`}><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h3 id={`documents-${shop.shopId}`} className="text-sm font-black text-slate-900">Required documents</h3><p className="mt-1 text-xs text-slate-500">Accept or reject one file at a time. Changes apply only to this shop.</p></div><span className="text-xs font-bold text-slate-600">{shop.progressLabel}</span></div><div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{shop.documents.map((document) => { const actionKey = `document-${document.id}`; const isReviewing = Boolean(document.id && reviewingDocIds[document.id]); const displayedDocumentStatus = isReviewing ? "PENDING" : document.status; const isFinal = document.status === "APPROVED" || document.status === "REJECTED"; const canAct = Boolean(document.id && document.file_url); return <article key={document.doc_type} className="border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="text-xs font-black text-slate-900">{document.label}</h4><p className="mt-1 text-[10px] text-slate-500">Uploaded {formatDate(document.created_at, { month: "short", day: "numeric", year: "numeric" })}</p></div><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${documentClass(displayedDocumentStatus, Boolean(document.id))}`}><DocumentStatusIcon status={displayedDocumentStatus} hasDocument={Boolean(document.id)} />{document.id ? displayedDocumentStatus : "Not uploaded"}</span></div>{document.id ? <div className="mt-3 space-y-2"><div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600"><span className="col-span-2 truncate font-semibold text-slate-900">{getFileName(document)}</span><span><strong>Format:</strong> {getFileFormat(document)}</span><span><strong>Size:</strong> {formatFileSize(document.file_size_bytes)}</span><span className="col-span-2"><strong>Quality:</strong> {document.quality_requirement || "Not specified"}</span></div>{document.admin_comment && <p className="border-l-2 border-[#EC008C] bg-rose-50/50 px-3 py-2 text-[11px] text-slate-700"><strong>Admin feedback:</strong> {document.admin_comment}</p>}<button type="button" onClick={() => openDocument(document)} disabled={!document.file_url} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#00C7C7] hover:text-[#007C7D] disabled:cursor-not-allowed disabled:opacity-40"><Eye size={14} /> Review File</button>{isFinal && !isReviewing ? <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2"><p className={`flex items-center gap-1 text-[11px] font-bold ${document.status === "APPROVED" ? "text-emerald-700" : "text-rose-700"}`}>{document.status === "APPROVED" ? <><Check size={14} /> Accepted</> : <><XCircle size={14} /> Needs changes</>}</p><button type="button" onClick={() => setReviewingDocIds((current) => ({ ...current, [document.id]: true }))} aria-label={`Review ${document.label} again`} title="Review document again" className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:border-[#00C7C7] hover:text-[#007C7D]"><RefreshCcw size={14} aria-hidden="true" /></button></div> : canAct && <div className="space-y-2 border-t border-slate-100 pt-2"><input type="text" value={adminComments[document.id] ?? document.admin_comment ?? ""} onChange={(event) => setAdminComments((current) => ({ ...current, [document.id]: event.target.value }))} maxLength={500} placeholder="Optional note for the owner..." aria-label={`Admin comment for ${document.label}`} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00C7C7]" /><div className="flex gap-2"><button type="button" onClick={() => handleDocumentAction(shop, document, "APPROVED")} disabled={actionLoading[actionKey]} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{actionLoading[actionKey] && <Loader2 size={13} className="animate-spin" />} Accept</button><button type="button" onClick={() => openRejectForm(shop, document)} disabled={actionLoading[actionKey]} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#EC008C] px-3 py-2 text-xs font-black text-white hover:bg-[#C40075] disabled:cursor-not-allowed disabled:opacity-50">Reject</button></div></div>}</div> : <p className="mt-3 flex items-center gap-2 text-[11px] italic text-slate-400"><Info size={14} /> No file uploaded by the Business Owner yet.</p>}</article>; })}</div></section>

          {canApproveShop && <div className="flex flex-col gap-3 border-t-2 border-[#00C7C7] bg-[#00FFFF]/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-slate-900">Ready for final approval</p><p className="mt-1 text-xs text-slate-600">All four required documents are accepted. The shop will remain pending until you approve it.</p></div><button type="button" onClick={() => setApprovalShop(shop)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white hover:bg-[#00A878]"><CheckCircle2 size={15} /> Approve this shop</button></div>}
          </div>}</article>; })}<Pager pagination={pagination} onPageChange={(nextPage) => { setPage(nextPage); setExpandedId(null); }} /></div>}
        </section>
      </main>
    </>
  );
}
