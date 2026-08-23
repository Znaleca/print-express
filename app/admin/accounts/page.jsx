"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resolveStorageUrl } from "@/lib/imageUpload";
import {
  Fingerprint, Mail, Shield, Loader2, X,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  FileText, Hash, Eye, MessageSquare, RefreshCcw,
  ShieldCheck, AlertCircle, Users, Building2, CheckCircle2, Tag
} from "lucide-react";

const REQUIRED_DOC_TYPES = ["DTI", "MAYORS_PERMIT", "BIR", "VALID_ID"];

const DOC_META = {
  DTI:           { label: "DTI Certificate" },
  MAYORS_PERMIT: { label: "Mayor's Permit" },
  BIR:           { label: "BIR Certificate" },
  VALID_ID:      { label: "Valid ID" },
};

export default function AdminAccounts() {
  const [activeTab, setActiveTab] = useState("verifications");
  const [businesses, setBusinesses] = useState([]);
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [verificationError, setVerificationError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [adminComments, setAdminComments] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);
  const [previewDocUrl, setPreviewDocUrl] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [categoryRequests, setCategoryRequests] = useState([]);
  const [profileRequestComments, setProfileRequestComments] = useState({});

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const formatFileSize = (bytes) => bytes ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : "Size not stored";
  const getFileName = (doc) => {
    if (doc?.file_name) return doc.file_name;
    if (!doc?.file_url) return "Uploaded document";
    try {
      return decodeURIComponent(doc.file_url.split("/").pop() || "Uploaded document");
    } catch {
      return "Uploaded document";
    }
  };
  const getFileFormat = (doc) => {
    if (doc?.file_format) return doc.file_format;
    const source = doc?.file_name || doc?.file_url || "";
    return source.includes(".") ? source.split(".").pop().toUpperCase() : "Unknown";
  };
  const openDocument = async (doc) => {
    const url = await resolveStorageUrl(doc?.file_url);
    if (url) setPreviewDocUrl(url);
    else showToast("This document is unavailable or access was denied.", "error");
  };

  const fetchVerifications = useCallback(async () => {
    setLoadingBiz(true);
    setVerificationError(null);
    try {
      const { data: bizList, error: businessError } = await supabase
        .from("businesses")
        .select(`id, name, description, products_summary, status, created_at, owner_id,
          business_documents (*)`)
        .order("created_at", { ascending: false })
        .range(0, 99);

      if (businessError) throw businessError;
      if (!bizList) throw new Error("The verification list is unavailable.");

      const ownerIds = [...new Set(bizList.map((b) => b.owner_id))];
      const { data: profiles, error: profilesError } = ownerIds.length > 0
        ? await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ownerIds)
          .range(0, 99)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      const { data: profileRequests, error: profileRequestsError } = await supabase
        .from("business_profile_change_requests")
        .select("id, business_id, requested_description, requested_products_summary, reason, status, admin_comment, created_at, reviewed_at")
        .order("created_at", { ascending: false })
        .range(0, 99);
      if (profileRequestsError) throw profileRequestsError;
      const requestsByBusiness = (profileRequests || []).reduce((map, request) => {
        map[request.business_id] = [...(map[request.business_id] || []), request];
        return map;
      }, {});
      setBusinesses(bizList.map((b) => ({
        ...b,
        owner: profileMap[b.owner_id] || null,
        profile_change_requests: requestsByBusiness[b.id] || [],
      })));

      const { data: requests, error: categoryError } = await supabase
        .from("category_approval_requests")
        .select("id, business_id, category_name, reason, status, created_at, businesses(id, name, owner_id)")
        .order("created_at", { ascending: false })
        .range(0, 99);
      if (categoryError) throw categoryError;
      setCategoryRequests(requests || []);
    } catch (error) {
      console.error("Admin verification load error:", error);
      setBusinesses([]);
      setCategoryRequests([]);
      setVerificationError("We could not load verification data. Check your admin session and try again.");
    } finally {
      setLoadingBiz(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch("/api/admin/dashboard", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const raw = await response.text();
      let payload = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
      if (!response.ok) throw new Error(payload.error || "Could not load user accounts.");
      setUsers(payload.users || []);
    } catch (error) {
      console.error("Admin user directory load error:", error);
      showToast(error.message || "Could not load user accounts.", "error");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { fetchVerifications(); }, [fetchVerifications]);
  useEffect(() => {
    if (users.length === 0) fetchUsers();
  }, [activeTab, users.length, fetchUsers]);

  const updateBusinessStatus = async (businessId, action) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");

    const response = await fetch("/api/admin/dashboard", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ businessId, action }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.details || payload.error || "Could not update business status.");
    return payload;
  };

  const autoApproveBusiness = async (businessId, updatedDocs) => {
    const allApproved = REQUIRED_DOC_TYPES.every((type) => {
      const d = updatedDocs.find((d) => d.doc_type === type);
      return d?.status === "APPROVED";
    });
    if (allApproved) {
      await updateBusinessStatus(businessId, "APPROVE");
      setBusinesses((prev) =>
        prev.map((b) => b.id === businessId ? { ...b, status: "APPROVED" } : b)
      );
      showToast("All documents verified! Business is now Approved.");
    }
  };

  const handleDocAction = async (docId, newStatus, businessId) => {
    setActionLoading((prev) => ({ ...prev, [docId]: true }));
    try {
      const comment = adminComments[docId] || "";
      const { error } = await supabase
        .from("business_documents")
        .update({
          status: newStatus,
          admin_comment: comment,
          updated_at: new Date().toISOString(),
        })
        .eq("id", docId);

      if (error) throw error;

      const targetBusiness = businesses.find((business) => business.id === businessId);
      const updatedDocsForApproval = (targetBusiness?.business_documents || []).map((document) =>
        document.id === docId ? { ...document, status: newStatus, admin_comment: comment } : document
      );
      setBusinesses((prev) => prev.map((business) => (
        business.id === businessId
          ? { ...business, business_documents: updatedDocsForApproval }
          : business
      )));
      const shouldAutoApprove = REQUIRED_DOC_TYPES.every((type) => {
        const document = updatedDocsForApproval.find((item) => item.doc_type === type);
        return document?.status === "APPROVED";
      });
      if (shouldAutoApprove) {
        await autoApproveBusiness(businessId, updatedDocsForApproval);
      }
      showToast(`Document ${newStatus.toLowerCase()}.`);
    } catch (err) {
      showToast(err.message || "Failed to update document status.", "error");
    } finally {
      setActionLoading((prev) => ({ ...prev, [docId]: false }));
    }
  };

  const handleCategoryAction = async (requestId, newStatus) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      const { error } = await supabase
        .from("category_approval_requests")
        .update({ status: newStatus })
        .eq("id", requestId);
      if (error) throw error;
      setCategoryRequests((prev) => prev.map((request) => (
        request.id === requestId ? { ...request, status: newStatus } : request
      )));
      showToast(`Category request ${newStatus.toLowerCase()}.`);
    } catch (err) {
      showToast(err.message || "Failed to update category request.", "error");
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const handleProfileRequestAction = async (request, newStatus, business) => {
    const actionKey = `profile-${request.id}`;
    setActionLoading((prev) => ({ ...prev, [actionKey]: true }));
    try {
      const adminComment = profileRequestComments[request.id] || request.admin_comment || null;

      if (newStatus === "APPROVED") {
        const { error: businessError } = await supabase
          .from("businesses")
          .update({
            description: request.requested_description,
            products_summary: request.requested_products_summary,
          })
          .eq("id", business.id);
        if (businessError) throw businessError;
      }

      const { error: requestError } = await supabase
        .from("business_profile_change_requests")
        .update({
          status: newStatus,
          admin_comment: adminComment,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (requestError) throw requestError;

      setBusinesses((prev) => prev.map((item) => {
        if (item.id !== business.id) return item;
        return {
          ...item,
          description: newStatus === "APPROVED" ? request.requested_description : item.description,
          products_summary: newStatus === "APPROVED" ? request.requested_products_summary : item.products_summary,
          profile_change_requests: (item.profile_change_requests || []).map((itemRequest) => (
            itemRequest.id === request.id
              ? { ...itemRequest, status: newStatus, admin_comment: adminComment, reviewed_at: new Date().toISOString() }
              : itemRequest
          )),
        };
      }));
      showToast(`Profile change request ${newStatus.toLowerCase()}.`);
    } catch (err) {
      showToast(err.message || "Failed to update profile change request.", "error");
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  if (loadingBiz) {
    return (
        <main className="admin-page min-h-screen bg-[#F6F6F2] flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading verification portal...</p>
        </div>
      </main>
    );
  }

  if (verificationError) {
    return (
      <main className="admin-page flex min-h-screen items-center justify-center bg-[#F6F6F2] px-6 font-sans text-slate-900">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-4 text-[#EC008C]" size={34} />
          <h1 className="text-xl font-black">Verification data unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{verificationError}</p>
          <button
            type="button"
            onClick={fetchVerifications}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#EC008C]"
          >
            <RefreshCcw size={14} /> Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      {previewDocUrl && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setPreviewDocUrl(null)}>
          <div className="dialog-surface max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-900">Document Reviewer</h3>
              <button onClick={() => setPreviewDocUrl(null)} className="p-1 text-slate-400 hover:text-slate-800"><X size={18} /></button>
            </div>
            {previewDocUrl.match(/\.(jpeg|jpg|png|webp|gif|svg)$/i) ? (
              <img src={previewDocUrl} alt="Doc preview" className="w-full h-auto rounded-xl max-h-[70vh] object-contain border border-slate-200" />
            ) : (
              <iframe src={previewDocUrl} title="Doc" className="w-full h-[70vh] rounded-xl border border-slate-200" />
            )}
          </div>
        </div>
      )}

      <main className="admin-page min-h-screen bg-[#F6F6F2] font-sans text-slate-900 pb-24">
        
        {/* Header */}
        <section className="relative overflow-hidden bg-[#1A1A1A] border-b border-white/10 py-8 px-4 text-white sm:px-6 lg:px-8">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />
          <div className="mx-auto flex max-w-7xl flex-col gap-5">
            <div>
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FFFF]">Admin workspace</div>
              <h1 className="text-3xl font-black uppercase tracking-tight text-white">Verifications & accounts</h1>
              <p className="mt-2 max-w-2xl text-xs text-white/65">Review business document uploads, grant verification badges, approve new categories, and browse platform users.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Admin account sections">
              <button
                onClick={() => setActiveTab("verifications")}
                className={`border px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === "verifications" ? "border-[#00FFFF] bg-[#00FFFF] text-[#1A1A1A]" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                role="tab"
                aria-selected={activeTab === "verifications"}
              >
                Verification Requests ({businesses.length})
              </button>
              <button
                onClick={() => setActiveTab("categories")}
                className={`border px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === "categories" ? "border-[#00FFFF] bg-[#00FFFF] text-[#1A1A1A]" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                role="tab"
                aria-selected={activeTab === "categories"}
              >
                Category Approvals ({categoryRequests.filter((request) => request.status === "PENDING").length})
              </button>
              <button
                onClick={() => setActiveTab("accounts")}
                className={`border px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === "accounts" ? "border-[#00FFFF] bg-[#00FFFF] text-[#1A1A1A]" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                role="tab"
                aria-selected={activeTab === "accounts"}
              >
                User Accounts Directory ({users.length})
              </button>
              <button
                type="button"
                onClick={() => { fetchVerifications(); if (activeTab === "accounts") fetchUsers(); }}
                className="ml-auto inline-flex items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <RefreshCcw size={13} /> Refresh
              </button>
            </div>
          </div>
        </section>

        {toast && (
          <div className="fixed bottom-6 right-6 z-[200] px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg">
            {toast.msg}
          </div>
        )}

        {/* Content Tabs */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          
          {activeTab === "verifications" ? (
            <div className="space-y-4">
              {businesses.map((b) => {
                const docs = b.business_documents || [];
                const profileRequests = b.profile_change_requests || [];
                const approvedDocs = docs.filter(d => d.status === "APPROVED").length;
                const isExpanded = expandedId === b.id;

                return (
                  <div key={b.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <div className="flex items-center justify-between gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : b.id)}>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-slate-900">{b.name}</h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            b.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {b.status === "APPROVED" ? "Verified Partner" : "Verification Pending"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Owner: {b.owner?.full_name || "Unknown"} ({b.owner?.email}) • {approvedDocs} of 4 docs approved</p>
                        <div className="mt-3 grid max-w-4xl grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                          <div className="border-l-2 border-[#00C7C7] pl-2">
                            <p className="font-black uppercase tracking-[0.12em] text-[#008F91]">Business background</p>
                            <p className="mt-0.5 line-clamp-2 leading-relaxed text-slate-600">{b.description || "Not provided"}</p>
                          </div>
                          <div className="border-l-2 border-[#D1C500] pl-2">
                            <p className="font-black uppercase tracking-[0.12em] text-[#8A8200]">Products &amp; services</p>
                            <p className="mt-0.5 line-clamp-2 leading-relaxed text-slate-600">{b.products_summary || "Not provided"}</p>
                          </div>
                        </div>
                      </div>

                      <button className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="space-y-4 border-t border-slate-100 pt-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#009FA0]">Business background</p>
                            <p className="mt-2 text-xs leading-relaxed text-slate-600">{b.description || "Not provided"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#C6B900]">Products &amp; services offered</p>
                            <p className="mt-2 text-xs leading-relaxed text-slate-600">{b.products_summary || "Not provided"}</p>
                          </div>
                        </div>

                        {profileRequests.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Profile change requests</h4>
                              <span className="text-[10px] font-semibold text-slate-400">{profileRequests.length} request{profileRequests.length === 1 ? "" : "s"}</span>
                            </div>
                            {profileRequests.map((request) => {
                              const requestActionKey = `profile-${request.id}`;
                              const isPending = request.status === "PENDING";
                              return (
                                <div key={request.id} className={`rounded-xl border p-4 ${
                                  isPending ? "border-[#00C7C7]/40 bg-[#00C7C7]/[0.04]" : "border-slate-200 bg-slate-50"
                                }`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-bold text-slate-900">Requested {new Date(request.created_at).toLocaleDateString()}</p>
                                      <p className="mt-0.5 text-[11px] text-slate-500">Reason: {request.reason}</p>
                                    </div>
                                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                                      request.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                                      request.status === "REJECTED" ? "bg-rose-100 text-rose-800" :
                                      "bg-amber-100 text-amber-800"
                                    }`}>{request.status}</span>
                                  </div>

                                  <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] md:grid-cols-2">
                                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                                      <p className="font-black uppercase tracking-[0.1em] text-[#008F91]">Requested background</p>
                                      <p className="mt-1 leading-relaxed text-slate-600">{request.requested_description}</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                                      <p className="font-black uppercase tracking-[0.1em] text-[#8A8200]">Requested products</p>
                                      <p className="mt-1 leading-relaxed text-slate-600">{request.requested_products_summary}</p>
                                    </div>
                                  </div>

                                  {isPending ? (
                                    <div className="mt-3 space-y-2">
                                      <input
                                        type="text"
                                        value={profileRequestComments[request.id] || ""}
                                        onChange={(event) => setProfileRequestComments((current) => ({ ...current, [request.id]: event.target.value }))}
                                        placeholder="Optional note for the owner..."
                                        maxLength={300}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00C7C7]"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleProfileRequestAction(request, "APPROVED", b)}
                                          disabled={actionLoading[requestActionKey]}
                                          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >Approve and apply
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleProfileRequestAction(request, "REJECTED", b)}
                                          disabled={actionLoading[requestActionKey]}
                                          className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                        >Reject request
                                        </button>
                                      </div>
                                    </div>
                                  ) : request.admin_comment ? (
                                    <p className="mt-3 text-[11px] text-slate-500"><strong>Admin note:</strong> {request.admin_comment}</p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {REQUIRED_DOC_TYPES.map((type) => {
                          const doc = docs.find(d => d.doc_type === type);
                          const meta = DOC_META[type] || { label: type };

                          return (
                            <div key={type} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-slate-900">{meta.label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  doc?.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                                  doc?.status === "REJECTED" ? "bg-rose-100 text-rose-800" :
                                  doc ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"
                                }`}>
                                  {doc?.status || "Not Uploaded"}
                                </span>
                              </div>

                              {doc?.file_url ? (
                                <div className="space-y-2">
                                  <button
                                    onClick={() => openDocument(doc)}
                                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                                  >
                                    <Eye size={14} /> Review File
                                  </button>

                                  <div className="rounded-lg bg-white border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
                                    <p className="font-semibold text-slate-900 truncate">{getFileName(doc)}</p>
                                    <div className="grid grid-cols-2 gap-1">
                                      <span><strong>Type:</strong> Verification file</span>
                                      <span><strong>Format:</strong> {getFileFormat(doc)}</span>
                                      <span><strong>Size:</strong> {formatFileSize(doc.file_size_bytes)}</span>
                                      <span><strong>Quality:</strong> {doc.quality_requirement || "Clear scan"}</span>
                                    </div>
                                  </div>

                                  <input
                                    type="text"
                                    placeholder="Add feedback comment for owner..."
                                    value={adminComments[doc.id] || doc.admin_comment || ""}
                                    onChange={(e) => setAdminComments({ ...adminComments, [doc.id]: e.target.value })}
                                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                                  />

                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleDocAction(doc.id, "APPROVED", b.id)}
                                      disabled={actionLoading[doc.id]}
                                      className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleDocAction(doc.id, "REJECTED", b.id)}
                                      disabled={actionLoading[doc.id]}
                                      className="flex-1 py-1.5 bg-rose-600 text-white rounded-lg font-bold text-xs hover:bg-rose-700"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 italic">No document file uploaded by shop owner yet.</p>
                              )}
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : activeTab === "categories" ? (
            <div className="space-y-4">
              {categoryRequests.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-500">
                  No category approval requests found.
                </div>
              ) : categoryRequests.map((request) => (
                <div key={request.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Tag size={16} className="text-[#EC008C]" />
                      <h3 className="font-bold text-sm text-slate-900">{request.category_name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        request.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                        request.status === "REJECTED" ? "bg-rose-100 text-rose-800" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {request.status || "PENDING"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Shop: {request.businesses?.name || "Unknown shop"} | Requested {new Date(request.created_at || Date.now()).toLocaleDateString()}
                    </p>
                    {request.reason && (
                      <p className="mt-2 text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-3">
                        {request.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleCategoryAction(request.id, "APPROVED")}
                      disabled={actionLoading[request.id] || request.status === "APPROVED"}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleCategoryAction(request.id, "REJECTED")}
                      disabled={actionLoading[request.id] || request.status === "REJECTED"}
                      className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-3 px-4">Full Name</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-right">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{u.full_name || "User Account"}</td>
                      <td className="py-3 px-4 text-slate-500">{u.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {u.role || "CUSTOMER"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400">
                        {new Date(u.created_at || Date.now()).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </section>

      </main>
    </>
  );
}
