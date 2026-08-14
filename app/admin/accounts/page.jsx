"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
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
  const [expandedId, setExpandedId] = useState(null);
  const [adminComments, setAdminComments] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);
  const [previewDocUrl, setPreviewDocUrl] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [categoryRequests, setCategoryRequests] = useState([]);

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

  const fetchVerifications = useCallback(async () => {
    setLoadingBiz(true);
    try {
      const { data: bizList } = await supabase
        .from("businesses")
        .select(`id, name, status, created_at, owner_id,
          business_documents (*)`)
        .order("created_at", { ascending: false });

      if (!bizList) return;

      const ownerIds = [...new Set(bizList.map((b) => b.owner_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds);

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      setBusinesses(bizList.map((b) => ({ ...b, owner: profileMap[b.owner_id] || null })));

      const { data: requests } = await supabase
        .from("category_approval_requests")
        .select("id, business_id, category_name, reason, status, created_at, businesses(id, name, owner_id)")
        .order("created_at", { ascending: false });
      setCategoryRequests(requests || []);
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
      setUsers(payload.users || []);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { fetchVerifications(); }, [fetchVerifications]);
  useEffect(() => {
    if (users.length === 0) fetchUsers();
  }, [activeTab, users.length, fetchUsers]);

  const autoApproveBusiness = async (businessId, updatedDocs) => {
    const allApproved = REQUIRED_DOC_TYPES.every((type) => {
      const d = updatedDocs.find((d) => d.doc_type === type);
      return d?.status === "APPROVED";
    });
    if (allApproved) {
      await supabase.from("businesses").update({ status: "APPROVED" }).eq("id", businessId);
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

      setBusinesses((prev) =>
        prev.map((b) => {
          if (b.id !== businessId) return b;
          const updatedDocs = (b.business_documents || []).map((d) =>
            d.id === docId ? { ...d, status: newStatus, admin_comment: comment } : d
          );
          autoApproveBusiness(businessId, updatedDocs);
          return { ...b, business_documents: updatedDocs };
        })
      );
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

  if (loadingBiz) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading verification portal...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      {previewDocUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setPreviewDocUrl(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
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

      <main className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
        
        {/* Header */}
        <section className="bg-white border-b border-slate-200 py-8 px-4 sm:px-6 lg:px-8 relative shadow-sm">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Verifications & Accounts</h1>
              <p className="mt-1 text-xs text-slate-500">Review business document uploads, grant verification badges, and browse platform user accounts.</p>
            </div>

            <div className="flex gap-2 border-b border-slate-200">
              <button
                onClick={() => setActiveTab("verifications")}
                className={`pb-3 text-xs font-bold transition-all relative ${
                  activeTab === "verifications" ? "text-slate-900 border-b-2 border-[#EC008C]" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Verification Requests ({businesses.length})
              </button>
              <button
                onClick={() => setActiveTab("categories")}
                className={`pb-3 text-xs font-bold transition-all relative ${
                  activeTab === "categories" ? "text-slate-900 border-b-2 border-[#EC008C]" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Category Approvals ({categoryRequests.filter((request) => request.status === "PENDING").length})
              </button>
              <button
                onClick={() => setActiveTab("accounts")}
                className={`pb-3 text-xs font-bold transition-all relative ${
                  activeTab === "accounts" ? "text-slate-900 border-b-2 border-[#EC008C]" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                User Accounts Directory ({users.length})
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
                      </div>

                      <button className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    onClick={() => setPreviewDocUrl(doc.file_url)}
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
