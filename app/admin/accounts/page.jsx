"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Fingerprint, Mail, Shield, Loader2,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  FileText, Hash, Eye, MessageSquare, RefreshCcw,
  ShieldCheck, AlertCircle, Users, Building2
} from "lucide-react";

const REQUIRED_DOC_TYPES = ["DTI", "MAYORS_PERMIT", "BIR", "VALID_ID", "TIN_NUMBER"];

const DOC_META = {
  DTI:           { label: "DTI Certificate",  color: "#00FFFF", textColor: "#1A1A1A" },
  MAYORS_PERMIT: { label: "Mayor's Permit",    color: "#EC008C", textColor: "#ffffff" },
  BIR:           { label: "BIR Certificate",   color: "#FFF200", textColor: "#1A1A1A" },
  VALID_ID:      { label: "Valid ID (Owner)",  color: "#1A1A1A", textColor: "#ffffff" },
  TIN_NUMBER:    { label: "TIN Number",        color: "#EC008C", textColor: "#ffffff" },
};

export default function AdminAccounts() {
  const [activeTab, setActiveTab]         = useState("verifications");
  // Verifications tab
  const [businesses, setBusinesses]       = useState([]);
  const [loadingBiz, setLoadingBiz]       = useState(true);
  const [expandedId, setExpandedId]       = useState(null);
  const [adminComments, setAdminComments] = useState({}); // { docId: commentText }
  const [actionLoading, setActionLoading] = useState({}); // { docId: true/false }
  const [toast, setToast]                 = useState(null);
  const [rejectPrompt, setRejectPrompt]   = useState({ open: false, message: "" });
  // Accounts tab
  const [users, setUsers]                 = useState([]);
  const [loadingUsers, setLoadingUsers]   = useState(false);

  /* ── TOAST ── */
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ── FETCH BUSINESSES + DOCS ── */
  const fetchVerifications = useCallback(async () => {
    setLoadingBiz(true);
    try {
      const { data: bizList } = await supabase
        .from("businesses")
        .select(`id, name, status, created_at, owner_id,
          business_documents (id, doc_type, file_url, tin_number, status, admin_comment, owner_comment, updated_at)`)
        .order("created_at", { ascending: false });

      if (!bizList) return;

      const ownerIds = [...new Set(bizList.map((b) => b.owner_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds);

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      setBusinesses(bizList.map((b) => ({ ...b, owner: profileMap[b.owner_id] || null })));
    } finally {
      setLoadingBiz(false);
    }
  }, []);

  /* ── FETCH USERS (Accounts tab) ── */
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
    if (activeTab === "accounts" && users.length === 0) fetchUsers();
  }, [activeTab, users.length, fetchUsers]);

  /* ── AUTO-APPROVE BUSINESS when all docs approved ── */
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
      showToast("All docs approved — business is now VERIFIED! 🎉");
    }
  };

  /* ── APPROVE DOC ── */
  const approveDoc = async (doc, businessId, allDocs) => {
    setActionLoading((p) => ({ ...p, [doc.id]: true }));
    try {
      await supabase.from("business_documents")
        .update({ status: "APPROVED", admin_comment: null })
        .eq("id", doc.id);

      const updatedDocs = allDocs.map((d) => d.id === doc.id ? { ...d, status: "APPROVED", admin_comment: null } : d);
      setBusinesses((prev) =>
        prev.map((b) => b.id === businessId
          ? { ...b, business_documents: updatedDocs }
          : b)
      );
      showToast(`${DOC_META[doc.doc_type]?.label} approved ✓`);
      await autoApproveBusiness(businessId, updatedDocs);
    } finally {
      setActionLoading((p) => ({ ...p, [doc.id]: false }));
    }
  };

  /* ── REJECT DOC ── */
  const rejectDoc = async (doc, businessId, allDocs) => {
    const comment = adminComments[doc.id] || "";
    if (!comment.trim()) {
      setRejectPrompt({
        open: true,
        message: `Please add a comment explaining the rejection for ${DOC_META[doc.doc_type]?.label || "this document"}.`,
      });
      return;
    }

    setActionLoading((p) => ({ ...p, [doc.id]: true }));
    try {
      await supabase.from("business_documents")
        .update({ status: "REJECTED", admin_comment: comment.trim() })
        .eq("id", doc.id);

      // Reset business status back to PENDING if it was APPROVED
      await supabase.from("businesses").update({ status: "PENDING" }).eq("id", businessId);

      const updatedDocs = allDocs.map((d) => d.id === doc.id ? { ...d, status: "REJECTED", admin_comment: comment.trim() } : d);
      setBusinesses((prev) =>
        prev.map((b) => b.id === businessId
          ? { ...b, status: "PENDING", business_documents: updatedDocs }
          : b)
      );
      showToast(`${DOC_META[doc.doc_type]?.label} rejected — owner notified.`, "error");
    } finally {
      setActionLoading((p) => ({ ...p, [doc.id]: false }));
    }
  };

  /* ── REVOKE APPROVED DOC -> PENDING ── */
  const revokeDocToPending = async (doc, businessId, allDocs) => {
    setActionLoading((p) => ({ ...p, [doc.id]: true }));
    try {
      await supabase.from("business_documents")
        .update({ status: "PENDING", admin_comment: null })
        .eq("id", doc.id);

      await supabase.from("businesses").update({ status: "PENDING" }).eq("id", businessId);

      const updatedDocs = allDocs.map((d) =>
        d.id === doc.id ? { ...d, status: "PENDING", admin_comment: null } : d
      );

      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === businessId
            ? { ...b, status: "PENDING", business_documents: updatedDocs }
            : b
        )
      );

      showToast(`${DOC_META[doc.doc_type]?.label} moved back to pending review.`);
    } finally {
      setActionLoading((p) => ({ ...p, [doc.id]: false }));
    }
  };

  /* ── STATUS BADGE ── */
  const StatusBadge = ({ status }) => {
    const config = {
      APPROVED: { icon: CheckCircle, bg: "bg-[#00FFFF]", text: "text-[#1A1A1A]" },
      REJECTED: { icon: XCircle,     bg: "bg-[#EC008C]", text: "text-white"     },
      PENDING:  { icon: Clock,       bg: "bg-[#FFF200]", text: "text-[#1A1A1A]" },
    }[status] || { icon: AlertCircle, bg: "bg-gray-200", text: "text-gray-600" };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 font-mono text-[9px] font-black uppercase tracking-widest border-2 border-black ${config.bg} ${config.text}`}>
        <Icon size={10} />{status}
      </span>
    );
  };

  /* ── SCORE SUMMARY for a business ── */
  const getDocScore = (docs) => {
    const approved = docs.filter((d) => d.status === "APPROVED").length;
    const rejected = docs.filter((d) => d.status === "REJECTED").length;
    const pending  = docs.filter((d) => d.status === "PENDING").length;
    return { approved, rejected, pending, total: REQUIRED_DOC_TYPES.length };
  };

  return (
    <main className="bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden font-sans">
      {rejectPrompt.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-md border-4 border-black bg-white p-6 shadow-[10px_10px_0px_0px_rgba(236,0,140,1)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center bg-[#EC008C] text-white border-2 border-black">
                <AlertCircle size={18} />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tighter">Comment Required</h3>
            </div>

            <p className="font-mono text-[10px] uppercase leading-relaxed text-gray-600">
              {rejectPrompt.message}
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setRejectPrompt({ open: false, message: "" })}
                className="border-2 border-black bg-[#1A1A1A] px-4 py-2 font-black text-[10px] uppercase tracking-widest text-white hover:bg-[#EC008C] transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="relative border-b-8 border-[#1A1A1A] px-6 py-12 md:px-10 md:py-14">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative mx-auto w-full max-w-[1920px]">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
            <span className="flex gap-1">
              <span className="h-2 w-2 bg-[#00FFFF]" />
              <span className="h-2 w-2 bg-[#EC008C]" />
              <span className="h-2 w-2 bg-[#FFF200]" />
            </span>
            Account_Intel // Verification_Grid
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-[0.95] md:text-7xl">
                Admin_<span className="bg-[#1A1A1A] px-4 py-1 text-white not-italic">Accounts</span>
              </h1>
              <p className="mt-4 max-w-3xl font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed text-gray-600 md:text-sm">
                Review business verification files, approve valid submissions, and audit user identities from one control surface.
              </p>
            </div>

            <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Active Tab</p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tighter">
                    {activeTab === "verifications" ? "Document Verifications" : "All Accounts"}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-white">
                  {activeTab === "verifications" ? <ShieldCheck className="h-6 w-6 text-[#00FFFF]" /> : <Users className="h-6 w-6 text-[#FFF200]" />}
                </div>
              </div>
              <div className="mt-4 flex gap-1">
                <div className="h-1 flex-1 bg-[#00FFFF]" />
                <div className="h-1 flex-1 bg-[#EC008C]" />
                <div className="h-1 flex-1 bg-[#FFF200]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-6 px-6 font-mono text-[10px] font-black uppercase tracking-[0.35em] md:px-10">
          <span className="text-[#00FFFF]">Cyan</span>
          <span className="text-[#EC008C]">Magenta</span>
          <span className="text-[#FFF200]">Yellow</span>
          <span className="text-white">Black</span>
        </div>
      </div>

      <section className="mx-auto w-full max-w-[1920px] px-6 py-10 md:px-10 md:py-14">

      {/* ── HEADER ── */}
      <header className="mb-8 border-b-4 border-black pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-2">Account_Directory</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">Global Identity Registry // Access_Level: 00</p>
        </div>
        {toast && (
          <div className={`px-4 py-2 font-mono text-[10px] font-black uppercase border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 ${
            toast.type === "error" ? "bg-[#EC008C] text-white" : "bg-[#FFF200] text-black"
          }`}>
            {toast.type === "error" ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
            {toast.msg}
          </div>
        )}
      </header>

      {/* ── TABS ── */}
      <div className="flex gap-0 mb-8 border-4 border-black w-fit shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        {[
          { id: "verifications", label: "Document Verifications", icon: ShieldCheck },
          { id: "accounts",      label: "All Accounts",           icon: Users },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-6 py-3 font-mono text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border-r-2 border-black last:border-r-0 ${
              activeTab === id ? "bg-[#1A1A1A] text-white" : "bg-white text-black hover:bg-[#F4F4F1]"
            }`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ══ TAB: VERIFICATIONS ══ */}
      {activeTab === "verifications" && (
        <div className="space-y-4">
          {loadingBiz ? (
            <div className="p-16 text-center font-mono uppercase">
              <Loader2 size={32} className="animate-spin mx-auto mb-4" />
              Loading business verifications...
            </div>
          ) : businesses.length === 0 ? (
            <div className="p-16 text-center border-4 border-dashed border-black/20 font-mono uppercase opacity-30">
              <Building2 size={48} className="mx-auto mb-4 opacity-30" />
              No businesses registered yet.
            </div>
          ) : businesses.map((biz) => {
            const { approved, rejected, pending, total } = getDocScore(biz.business_documents || []);
            const isExpanded = expandedId === biz.id;
            const docMap = Object.fromEntries((biz.business_documents || []).map((d) => [d.doc_type, d]));

            return (
              <div key={biz.id} className="bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                {/* Business Row Header */}
                <button onClick={() => setExpandedId(isExpanded ? null : biz.id)}
                  className="w-full flex items-center gap-4 p-5 hover:bg-[#F4F4F1] transition-colors text-left">
                  <div className="w-10 h-10 bg-[#1A1A1A] flex-shrink-0 flex items-center justify-center border-2 border-black">
                    <Building2 size={18} className="text-[#00FFFF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                      <p className="font-black uppercase italic text-lg tracking-tighter">{biz.name}</p>
                      <StatusBadge status={biz.status} />
                    </div>
                    <p className="font-mono text-[10px] uppercase opacity-50 truncate">
                      Owner: {biz.owner?.full_name || "Unknown"} — Registered {new Date(biz.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {/* Doc progress */}
                  <div className="flex-shrink-0 text-right mr-4 hidden md:block">
                    <div className="flex gap-2 justify-end mb-1">
                      <span className="font-mono text-[9px] bg-[#00FFFF] text-black px-2 py-0.5 font-black">{approved} APPROVED</span>
                      {rejected > 0 && <span className="font-mono text-[9px] bg-[#EC008C] text-white px-2 py-0.5 font-black">{rejected} REJECTED</span>}
                      {pending  > 0 && <span className="font-mono text-[9px] bg-[#FFF200] text-black px-2 py-0.5 font-black">{pending} PENDING</span>}
                    </div>
                    <div className="w-32 h-1.5 bg-gray-200 rounded overflow-hidden ml-auto">
                      <div className="h-full bg-[#00FFFF] transition-all" style={{ width: `${(approved / total) * 100}%` }} />
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={20} className="flex-shrink-0" /> : <ChevronDown size={20} className="flex-shrink-0" />}
                </button>

                {/* Expanded Doc Review Panel */}
                {isExpanded && (
                  <div className="border-t-4 border-black bg-[#F4F4F1] p-6">
                    <div className="grid gap-4">
                      {REQUIRED_DOC_TYPES.map((docType) => {
                        const doc  = docMap[docType];
                        const meta = DOC_META[docType];

                        return (
                          <div key={docType} className="bg-white border-2 border-black overflow-hidden">
                            {/* Doc Header */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-black"
                              style={{ backgroundColor: meta.color }}>
                              <FileText size={14} style={{ color: meta.textColor }} />
                              <p className="font-black text-[11px] uppercase tracking-widest flex-1" style={{ color: meta.textColor }}>{meta.label}</p>
                              {doc ? <StatusBadge status={doc.status} /> : (
                                <span className="font-mono text-[9px] font-black uppercase opacity-60 px-2 py-1 border border-current" style={{ color: meta.textColor }}>NOT SUBMITTED</span>
                              )}
                            </div>

                            {doc ? (
                              <div className="p-4 space-y-4">
                                {/* File link */}
                                {doc.file_url && (
                                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 bg-[#1A1A1A] text-white px-3 py-2 font-mono text-[10px] font-black uppercase hover:bg-[#00FFFF] hover:text-black transition-all">
                                    <Eye size={12} /> VIEW DOCUMENT
                                  </a>
                                )}

                                {/* Owner comment */}
                                {doc.owner_comment && (
                                  <div className="flex items-start gap-2 bg-blue-50 border-2 border-blue-200 p-3">
                                    <MessageSquare size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-mono text-[8px] uppercase text-blue-500 mb-1">Owner Note:</p>
                                      <p className="font-mono text-[10px] text-blue-700">{doc.owner_comment}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Previous admin comment */}
                                {doc.admin_comment && (
                                  <div className="flex items-start gap-2 bg-red-50 border-2 border-[#EC008C]/30 p-3">
                                    <AlertCircle size={12} className="text-[#EC008C] flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-mono text-[8px] uppercase text-[#EC008C] mb-1">Previous Rejection Reason:</p>
                                      <p className="font-mono text-[10px] text-[#EC008C]">{doc.admin_comment}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Action area — show if not already approved */}
                                {doc.status !== "APPROVED" && (
                                  <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t-2 border-black/10">
                                    <textarea
                                      value={adminComments[doc.id] || ""}
                                      onChange={(e) => setAdminComments((p) => ({ ...p, [doc.id]: e.target.value }))}
                                      placeholder="Rejection reason (required to reject)..."
                                      rows={2}
                                      className="flex-1 bg-white border-2 border-black p-3 font-mono text-[10px] uppercase resize-none focus:outline-none focus:ring-2 ring-[#EC008C]/30" />
                                    <div className="flex sm:flex-col gap-2">
                                      <button
                                        onClick={() => approveDoc(doc, biz.id, biz.business_documents)}
                                        disabled={actionLoading[doc.id]}
                                        className="flex-1 sm:flex-none bg-[#00FFFF] text-black border-2 border-black px-4 py-2 font-black text-[10px] uppercase hover:bg-black hover:text-[#00FFFF] transition-all disabled:opacity-50 flex items-center justify-center gap-1 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                                        {actionLoading[doc.id] ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                        APPROVE
                                      </button>
                                      <button
                                        onClick={() => rejectDoc(doc, biz.id, biz.business_documents)}
                                        disabled={actionLoading[doc.id]}
                                        className="flex-1 sm:flex-none bg-[#EC008C] text-white border-2 border-black px-4 py-2 font-black text-[10px] uppercase hover:bg-black hover:text-[#EC008C] transition-all disabled:opacity-50 flex items-center justify-center gap-1 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                                        {actionLoading[doc.id] ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                                        REJECT
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* If already approved, option to revoke */}
                                {doc.status === "APPROVED" && (
                                  <div className="flex items-center justify-between pt-2 border-t-2 border-black/10">
                                    <span className="font-mono text-[9px] uppercase text-green-600 font-black flex items-center gap-1">
                                      <CheckCircle size={10} /> Approved on {new Date(doc.updated_at).toLocaleDateString()}
                                    </span>
                                    <button
                                      onClick={() => revokeDocToPending(doc, biz.id, biz.business_documents)}
                                      disabled={actionLoading[doc.id]}
                                      className="font-mono text-[8px] uppercase text-[#EC008C] hover:underline font-black flex items-center gap-1">
                                      <RefreshCcw size={10} /> Revoke
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="p-4 font-mono text-[10px] uppercase opacity-30 italic">
                                No document submitted for this slot yet.
                              </div>
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
      )}

      {/* ══ TAB: ACCOUNTS ══ */}
      {activeTab === "accounts" && (
        <>
          <div className="flex items-center gap-3 mb-6 bg-black text-white px-4 py-2 w-fit italic">
            <Fingerprint size={20} className="text-[#00FFFF]" />
            <h2 className="font-black uppercase text-sm tracking-widest">Master_Profile_Registry</h2>
          </div>

          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-[#EBEBE8] border-b-4 border-black font-mono text-[10px] uppercase tracking-widest text-black">
                    <th className="p-4 border-r-2 border-black">Full Name</th>
                    <th className="p-4 border-r-2 border-black">Email</th>
                    <th className="p-4 border-r-2 border-black">Role</th>
                    <th className="p-4 text-center border-r-2 border-black">Created</th>
                    <th className="p-4 text-center">System ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black">
                  {loadingUsers ? (
                    <tr><td colSpan="5" className="p-12 text-center font-mono uppercase">
                      <Loader2 size={32} className="animate-spin mx-auto mb-4" />Scanning profiles...
                    </td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan="5" className="p-12 text-center font-mono uppercase opacity-30">No records found.</td></tr>
                  ) : users.map((profile) => (
                    <tr key={profile.id} className="hover:bg-[#00FFFF]/10 transition-colors">
                      <td className="p-4 border-r-2 border-black font-black uppercase text-sm italic">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-black rotate-45 flex-shrink-0" />
                          {profile.full_name || "NULL_IDENTITY"}
                        </div>
                      </td>
                      <td className="p-4 border-r-2 border-black font-mono text-[11px] text-zinc-600">
                        <div className="flex items-center gap-2"><Mail size={12} className="opacity-40" />{profile.email}</div>
                      </td>
                      <td className="p-4 border-r-2 border-black">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 text-[10px] font-bold border-2 border-black uppercase tracking-tighter ${
                          profile.role === "ADMIN"          ? "bg-[#FF3E00] text-white" :
                          profile.role === "BUSINESS_OWNER" ? "bg-[#00FFFF] text-black" :
                                                              "bg-white text-black"
                        }`}>
                          <Shield size={10} />{profile.role}
                        </span>
                      </td>
                      <td className="p-4 border-r-2 border-black text-center font-mono text-[10px]">
                        {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "N/A"}
                      </td>
                      <td className="p-4 text-center font-mono text-[9px] opacity-40">
                        {profile.id.split("-")[0]}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </section>
    </main>
  );
}
