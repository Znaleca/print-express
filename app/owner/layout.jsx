"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import OwnerSidebar from "@/components/owner/OwnerSidebar";
import {
  ShieldAlert, ShieldCheck, Loader2, Construction, Activity,
  CheckCircle, XCircle, Clock, Upload, AlertCircle,
  RefreshCcw, FileText, Hash, Trash2, Pencil, X
} from "lucide-react";

const REQUIRED_DOCS = ["DTI", "MAYORS_PERMIT", "BIR", "VALID_ID", "TIN_NUMBER"];

const DOC_META = {
  DTI:           { label: "DTI Certificate",  color: "#00FFFF", textColor: "#1A1A1A" },
  MAYORS_PERMIT: { label: "Mayor's Permit",    color: "#EC008C", textColor: "#ffffff" },
  BIR:           { label: "BIR Certificate",   color: "#FFF200", textColor: "#1A1A1A" },
  VALID_ID:      { label: "Valid ID (Owner)",  color: "#1A1A1A", textColor: "#ffffff" },
  TIN_NUMBER:    { label: "TIN Number",        color: "#EC008C", textColor: "#ffffff" },
};

export default function OwnerLayout({ children }) {
  const router = useRouter();
  const [state, setState]           = useState("checking");
  const [businessName, setBusinessName] = useState("");
  const [businessId, setBusinessId]   = useState(null);
  const [userId, setUserId]           = useState(null);
  const [docStatuses, setDocStatuses] = useState([]);
  const [mounted, setMounted]         = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Re-upload state per doc
  const [reuploadFiles, setReuploadFiles]       = useState({});
  const [reuploadPreviews, setReuploadPreviews] = useState({});
  const [reuploadTin, setReuploadTin]           = useState("");
  const [reuploadComments, setReuploadComments] = useState({});
  const [reuploadLoading, setReuploadLoading]   = useState({});
  const [deleteDocLoading, setDeleteDocLoading] = useState({});
  const [editSubmissionOpen, setEditSubmissionOpen] = useState({});
  const [reuploadError, setReuploadError]       = useState(null);

  const loadDocs = useCallback(async (bizId) => {
    const { data } = await supabase
      .from("business_documents")
      .select("*")
      .eq("business_id", bizId);
    return data || [];
  }, []);

  useEffect(() => {
    setMounted(true);

    const run = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { router.push("/login"); return; }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
      if (!profile || profile.role !== "BUSINESS_OWNER") { setState("unauthorized"); return; }

      const { data: business } = await supabase
        .from("businesses")
        .select("id, name, status")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!business) {
        const requestedName =
          (user.user_metadata?.business_name || "").trim() ||
          `${(user.user_metadata?.full_name || "").trim()}'s Business`;
        const { data: created } = await supabase
          .from("businesses")
          .insert({ owner_id: user.id, name: requestedName, status: "PENDING" })
          .select("id, name").single();
        setBusinessName(created?.name || "");
        setBusinessId(created?.id);
        setState("pending");
        return;
      }

      setBusinessName(business.name || "");
      setBusinessId(business.id);

      // If already fully approved at business level, skip doc check
      if (business.status === "APPROVED") {
        setState("approved");
        return;
      }

      // Fetch document statuses
      const docs = await loadDocs(business.id);
      setDocStatuses(docs);

      if (docs.length === 0) {
        setState("docs_action_required");
        return;
      }

      const hasRejected = docs.some((d) => d.status === "REJECTED");
      if (hasRejected || docs.length < 5) {
        setState("docs_action_required");
      } else {
        setState("docs_pending");
      }
    };

    run();
  }, [router, loadDocs]);

  useEffect(() => {
    return () => {
      Object.values(reuploadPreviews).forEach((previewUrl) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      });
    };
  }, [reuploadPreviews]);

  /* ── RE-UPLOAD ── */
  const handleReupload = async (docTypeStr, doc = null) => {
    setReuploadError(null);
    if (!reuploadFiles[docTypeStr]) { setReuploadError(`Please select a file for ${DOC_META[docTypeStr]?.label}.`); return; }

    setReuploadLoading((p) => ({ ...p, [docTypeStr]: true }));

    try {
      let payload = {
        business_id: businessId,
        doc_type: docTypeStr,
        status: "PENDING",
        owner_comment: reuploadComments[docTypeStr] || null,
        admin_comment: null,
      };

      const file = reuploadFiles[docTypeStr];
      const ext  = file.name.split(".").pop();
      const path = `${userId}/${docTypeStr}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("business-documents")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("business-documents").getPublicUrl(path);
      payload.file_url = publicUrl;

      if (doc?.id) {
        const { error: updateErr } = await supabase.from("business_documents").update(payload).eq("id", doc.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from("business_documents").insert([payload]);
        if (insertErr) throw insertErr;
      }

      // Refresh doc statuses
      const freshDocs = await loadDocs(businessId);
      setDocStatuses(freshDocs);

      const stillRejected = freshDocs.some((d) => d.status === "REJECTED");
      if (!stillRejected && freshDocs.length >= 5) setState("docs_pending");

      // Clear local state
      setReuploadFiles((p) => { const n = { ...p }; delete n[docTypeStr]; return n; });
      setReuploadPreviews((p) => {
        const n = { ...p };
        if (n[docTypeStr]) URL.revokeObjectURL(n[docTypeStr]);
        delete n[docTypeStr];
        return n;
      });
      setReuploadComments((p) => { const n = { ...p }; delete n[docTypeStr]; return n; });
      setEditSubmissionOpen((p) => ({ ...p, [docTypeStr]: false }));
    } catch (err) {
      setReuploadError(err.message);
    } finally {
      setReuploadLoading((p) => ({ ...p, [docTypeStr]: false }));
    }
  };

  const handleDeleteSubmission = async (docTypeStr, doc = null) => {
    if (!doc || doc.status === "APPROVED") return;

    setReuploadError(null);
    setDeleteDocLoading((p) => ({ ...p, [docTypeStr]: true }));

    try {
      if (doc.file_url) {
        const marker = "/storage/v1/object/public/business-documents/";
        const idx = doc.file_url.indexOf(marker);
        if (idx !== -1) {
          const filePath = decodeURIComponent(doc.file_url.slice(idx + marker.length));
          await supabase.storage.from("business-documents").remove([filePath]);
        }
      }

      const { error: deleteErr } = await supabase
        .from("business_documents")
        .delete()
        .eq("id", doc.id);

      if (deleteErr) {
        const { error: fallbackErr } = await supabase
          .from("business_documents")
          .update({
            file_url: null,
            owner_comment: null,
            admin_comment: null,
            status: "PENDING",
          })
          .eq("id", doc.id);
        if (fallbackErr) throw fallbackErr;
      }

      const freshDocs = await loadDocs(businessId);
      setDocStatuses(freshDocs);

      const stillRejected = freshDocs.some((d) => d.status === "REJECTED");
      if (!stillRejected && freshDocs.length >= 5) {
        setState("docs_pending");
      } else {
        setState("docs_action_required");
      }

      setReuploadFiles((p) => { const n = { ...p }; delete n[docTypeStr]; return n; });
      setReuploadPreviews((p) => {
        const n = { ...p };
        if (n[docTypeStr]) URL.revokeObjectURL(n[docTypeStr]);
        delete n[docTypeStr];
        return n;
      });
      setReuploadComments((p) => { const n = { ...p }; delete n[docTypeStr]; return n; });
      setEditSubmissionOpen((p) => ({ ...p, [docTypeStr]: false }));
    } catch (err) {
      setReuploadError(err.message || "Unable to delete this submission.");
    } finally {
      setDeleteDocLoading((p) => ({ ...p, [docTypeStr]: false }));
    }
  };

  /* ── STATIC GATE ── */
  const GateUI = ({ icon: Icon, title, message, badge, type, action }) => (
    <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-6 font-sans text-[#1A1A1A] overflow-x-hidden">
      <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
      <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
      <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />
      <div className="max-w-md w-full border-4 border-[#1A1A1A] p-8 bg-white shadow-[10px_10px_0px_0px_rgba(0,255,255,1)] relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div className={`p-3 border-2 border-[#1A1A1A] ${type === "error" ? "bg-[#EC008C] text-white" : "bg-[#FFF200] text-black"}`}>
              <Icon size={32} />
            </div>
            {badge && <span className="font-mono text-[10px] font-black uppercase tracking-widest border-2 border-[#1A1A1A] px-2 py-1">{badge}</span>}
          </div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none mb-4">
            {(title || "SYSTEM_LOG").replace(/\s/g, "_")}
          </h1>
          <p className="font-mono text-xs uppercase tracking-tight leading-relaxed opacity-70 mb-8 border-l-4 border-[#1A1A1A]/10 pl-4">{message}</p>
          {action && (
            <button onClick={action.onClick}
              className="w-full bg-[#1A1A1A] text-white py-4 font-mono text-[10px] font-black uppercase tracking-[0.3em] hover:bg-[#EC008C] transition-colors shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
              {action.label}
            </button>
          )}
          <div className="mt-8 pt-4 border-t border-[#1A1A1A]/5 flex justify-between font-mono text-[8px] opacity-40 uppercase">
            <span>Security_Layer: 04</span>
            <span>Auth_Check: {mounted ? new Date().toLocaleTimeString() : "INITIALIZING..."}</span>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── DOC REVIEW GATE (pending or action_required) ── */
  const DocReviewGate = () => {
    const hasRejected = docStatuses.some((d) => d.status === "REJECTED");
    const docMap = Object.fromEntries(docStatuses.map((d) => [d.doc_type, d]));

    const handlePreviewFile = (docType, file) => {
      setReuploadFiles((prev) => {
        const next = { ...prev, [docType]: file || null };
        if (!file) delete next[docType];
        return next;
      });

      setReuploadPreviews((prev) => {
        const next = { ...prev };
        if (next[docType]) URL.revokeObjectURL(next[docType]);

        if (!file) {
          delete next[docType];
          return next;
        }

        if (file.type.startsWith("image/")) {
          next[docType] = URL.createObjectURL(file);
        } else {
          next[docType] = null;
        }

        return next;
      });
    };

    return (
      <main className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden">
        <section className="relative border-b-8 border-[#1A1A1A] px-6 py-10 md:px-10 md:py-12">
          <div className="absolute top-0 left-0 w-16 h-16 bg-[#00FFFF] opacity-20" />
          <div className="absolute top-0 right-0 w-16 h-16 bg-[#EC008C] opacity-20" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-[#FFF200] opacity-20" />

          <div className="relative mx-auto max-w-6xl">
            <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-[#00FFFF]" />
                <span className="w-2 h-2 bg-[#EC008C]" />
                <span className="w-2 h-2 bg-[#FFF200]" />
              </span>
              Business Verification Upload
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
              <div>
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase italic tracking-tighter leading-[0.92]">
                  {hasRejected ? "Re-Upload_Files" : docStatuses.length < 5 ? "Complete_Requirements" : "Under_Review"}
                </h1>
                <p className="mt-4 max-w-3xl font-mono text-[11px] md:text-sm uppercase tracking-[0.2em] leading-relaxed text-gray-600">
                  {docStatuses.length < 5
                    ? `Upload the required verification documents for [${businessName}] so the shop can be reviewed.`
                    : hasRejected
                      ? `One or more documents for [${businessName}] were rejected. Replace the flagged files below.`
                      : `Your documents for [${businessName}] are now in the admin review queue.`}
                </p>
              </div>

              <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(236,0,140,1)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Status</p>
                    <p className="mt-1 text-lg font-black uppercase tracking-tighter">
                      {hasRejected ? "Action Required" : docStatuses.length < 5 ? "Missing Files" : "Pending Review"}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-white">
                    {hasRejected ? <AlertCircle className="h-6 w-6 text-[#EC008C]" /> : <ShieldCheck className="h-6 w-6 text-[#00FFFF]" />}
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

        <section className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
          {reuploadError && (
            <div className="mb-8 border-4 border-[#1A1A1A] bg-[#FFF200] px-5 py-4 font-mono text-[10px] font-black uppercase tracking-widest shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex items-center gap-3">
              <AlertCircle size={14} /> {reuploadError}
            </div>
          )}

          <div className="grid gap-6">
            {REQUIRED_DOCS.map((docType) => {
              const doc = docMap[docType];
              const meta = DOC_META[docType];
              const status = doc?.status || "NOT_SUBMITTED";
              const isRejected = status === "REJECTED";
              const isEditing = status === "NOT_SUBMITTED" || !!editSubmissionOpen[docType];

              return (
                <div
                  key={docType}
                  className={`overflow-hidden border-4 border-[#1A1A1A] bg-white shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] ${
                    isRejected ? "ring-4 ring-[#EC008C]/20" : ""
                  }`}
                >
                  <div className="flex items-stretch">
                    <div
                      className="hidden w-3 shrink-0 md:block"
                      style={{ backgroundColor: meta.color }}
                    />

                    <div className="flex-1">
                      <div className="flex flex-col gap-4 border-b-4 border-[#1A1A1A] p-5 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className="flex h-14 w-14 flex-shrink-0 items-center justify-center border-4 border-[#1A1A1A]"
                            style={{ backgroundColor: meta.color, color: meta.textColor }}
                          >
                            <FileText size={22} />
                          </div>
                          <div>
                            <p className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                              {meta.label}
                            </p>
                            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-gray-500">
                              {doc ? "Uploaded document slot" : "Awaiting upload"}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`inline-flex w-fit items-center gap-2 border-2 border-[#1A1A1A] px-3 py-2 font-mono text-[9px] font-black uppercase tracking-widest ${
                            status === "APPROVED"
                              ? "bg-[#00FFFF] text-[#1A1A1A]"
                              : status === "REJECTED"
                                ? "bg-[#EC008C] text-white"
                                : status === "PENDING"
                                  ? "bg-[#FFF200] text-[#1A1A1A]"
                                  : "bg-white text-[#1A1A1A]"
                          }`}
                        >
                          {status === "APPROVED" && <CheckCircle size={10} />}
                          {status === "REJECTED" && <XCircle size={10} />}
                          {status === "PENDING" && <Clock size={10} />}
                          {status}
                        </span>
                      </div>

                      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]">
                        <div className="space-y-4">
                          {isRejected && doc?.admin_comment && (
                            <div className="border-4 border-[#EC008C] bg-[#FFF4FA] p-4">
                              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#EC008C]">Admin Feedback</p>
                              <p className="mt-2 font-mono text-[11px] uppercase leading-relaxed text-[#1A1A1A]">
                                {doc.admin_comment}
                              </p>
                            </div>
                          )}

                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="border-2 border-[#1A1A1A]/10 bg-[#F9F9F7] p-4">
                              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-500">Guidance</p>
                              <p className="mt-2 font-black uppercase text-sm leading-tight">Upload a clear, legible copy</p>
                            </div>
                            <div className="border-2 border-[#1A1A1A]/10 bg-[#F9F9F7] p-4">
                              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-500">Format</p>
                              <p className="mt-2 font-black uppercase text-sm leading-tight">Image or PDF</p>
                            </div>
                            <div className="border-2 border-[#1A1A1A]/10 bg-[#F9F9F7] p-4">
                              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-500">Review</p>
                              <p className="mt-2 font-black uppercase text-sm leading-tight">Checked by admin</p>
                            </div>
                          </div>
                        </div>

                        {status !== "NOT_SUBMITTED" && (
                          <div className="border-4 border-[#1A1A1A] bg-[#FDFDFD] p-4 shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]">
                            {!isEditing && doc ? (
                              <div>
                                <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-gray-500">Submission Actions</p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <button
                                    onClick={() => setEditSubmissionOpen((p) => ({ ...p, [docType]: true }))}
                                    className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] text-white px-3 py-2 font-black uppercase tracking-widest text-[10px] hover:bg-[#EC008C]"
                                  >
                                    <Pencil size={12} /> Edit
                                  </button>

                                  {status !== "APPROVED" && (
                                    <button
                                      onClick={() => handleDeleteSubmission(docType, doc)}
                                      disabled={deleteDocLoading[docType]}
                                      className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-white px-3 py-2 font-black uppercase tracking-widest text-[10px] hover:bg-[#FFF200] disabled:opacity-50"
                                    >
                                      {deleteDocLoading[docType]
                                        ? <><Loader2 size={12} className="animate-spin" /> Deleting</>
                                        : <><Trash2 size={12} /> Delete</>}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-gray-500">
                                  {status === "NOT_SUBMITTED" ? "Upload File" : "Edit Submission"}
                                </p>
                                <div className="mt-3 space-y-4">
                                  <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center border-4 border-dashed border-[#1A1A1A]/20 bg-white px-4 py-6 text-center transition-all hover:border-[#EC008C]">
                                    <Upload size={22} className="mb-3 text-[#EC008C]" />
                                    <input
                                      type="file"
                                      accept="image/*,.pdf"
                                      onChange={(e) => handlePreviewFile(docType, e.target.files?.[0] || null)}
                                      className="hidden"
                                      disabled={reuploadLoading[docType]}
                                    />
                                    <span className="font-black uppercase tracking-widest text-sm">
                                      {reuploadFiles[docType] ? reuploadFiles[docType].name : status === "NOT_SUBMITTED" ? "Select File" : "Select Replacement"}
                                    </span>
                                    <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.25em] text-gray-500">
                                      {status === "NOT_SUBMITTED" ? "Tap to choose a document" : "Saving edits sets this document back to pending review"}
                                    </span>
                                  </label>

                                  {reuploadFiles[docType] && (
                                    <div className="border-4 border-[#1A1A1A] bg-[#F9F9F7] p-3">
                                      <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.25em] text-gray-500">Preview</p>
                                      {reuploadPreviews[docType] ? (
                                        <img
                                          src={reuploadPreviews[docType]}
                                          alt={`${meta.label} preview`}
                                          className="h-48 w-full border-2 border-[#1A1A1A] object-contain bg-white"
                                        />
                                      ) : (
                                        <div className="flex h-48 w-full items-center justify-center border-2 border-[#1A1A1A] bg-white text-center">
                                          <div>
                                            <FileText size={28} className="mx-auto mb-2 text-[#EC008C]" />
                                            <p className="font-black uppercase tracking-widest text-sm">PDF Selected</p>
                                            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.25em] text-gray-500">
                                              {reuploadFiles[docType].name}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <textarea
                                  value={reuploadComments[docType] || ""}
                                  onChange={(e) => setReuploadComments((p) => ({ ...p, [docType]: e.target.value }))}
                                  placeholder="Add an optional note for the reviewer"
                                  rows={3}
                                  className="mt-4 w-full border-4 border-[#1A1A1A]/10 bg-[#F9F9F7] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[#1A1A1A] outline-none focus:border-[#00FFFF]"
                                  disabled={reuploadLoading[docType]}
                                />

                                <button
                                  onClick={() => handleReupload(docType, doc)}
                                  disabled={reuploadLoading[docType]}
                                  className="mt-4 flex w-full items-center justify-center gap-2 bg-[#1A1A1A] px-4 py-4 font-black uppercase tracking-[0.25em] text-white transition-all hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {reuploadLoading[docType]
                                    ? <><Loader2 size={14} className="animate-spin" /> Uploading</>
                                    : <><Upload size={14} /> {status === "NOT_SUBMITTED" ? "Upload File" : "Save Changes"}</>}
                                </button>

                                {doc && (
                                  <button
                                    onClick={() => setEditSubmissionOpen((p) => ({ ...p, [docType]: false }))}
                                    disabled={reuploadLoading[docType]}
                                    className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-[#1A1A1A] bg-white px-4 py-3 font-black uppercase tracking-[0.25em] text-[#1A1A1A] transition-all hover:bg-[#FFF200] disabled:opacity-50"
                                  >
                                    <X size={14} /> Cancel Edit
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col gap-4 border-t-8 border-[#1A1A1A] pt-8 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl font-mono text-[10px] uppercase tracking-[0.25em] leading-relaxed text-gray-600">
              Admin reviews each document individually. Once all items are approved, your owner dashboard unlocks automatically.
            </p>
            <div className="flex gap-3">
              <div className="h-4 w-16 bg-[#00FFFF]" />
              <div className="h-4 w-16 bg-[#EC008C]" />
              <div className="h-4 w-16 bg-[#FFF200]" />
            </div>
          </div>
        </section>
      </main>
    );
  };

  /* ── STATE ROUTING ── */
  if (state === "checking") return (
    <GateUI icon={Activity} title="Syncing Credentials"
      message="Establishing secure connection. Checking authorization packets..."
      badge="SCANNING" type="loading" />
  );

  if (state === "unauthorized") return (
    <GateUI icon={ShieldAlert} title="Access Denied"
      message="Your profile lacks the BUSINESS_OWNER permission to access this terminal."
      badge="ERR_403" type="error"
      action={{ label: "Return_to_Nexus", onClick: () => router.push("/browse") }} />
  );

  if (state === "pending") return (
    <GateUI icon={Construction} title="Awaiting Validation"
      message={`[${businessName}] is in the verification queue. Submit your business documents and an admin will review them.`}
      badge="LOCKED" type="pending" />
  );

  if (state === "docs_pending" || state === "docs_action_required") return <DocReviewGate />;

  /* ── APPROVED PORTAL ── */
  return (
    <div className="flex min-h-[calc(100vh-80px)] bg-[radial-gradient(circle_at_top_left,rgba(0,255,255,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(236,0,140,0.12),transparent_24%),linear-gradient(180deg,#fdfdfd_0%,#f7f7f4_100%)]">
      <OwnerSidebar
        businessName={businessName}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((current) => !current)}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="min-h-full w-full">
          {children}
        </div>
      </main>
    </div>
  );
}