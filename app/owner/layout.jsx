"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import OwnerSidebar from "@/components/owner/OwnerSidebar";
import OwnerOnboarding from "@/components/onboarding/OwnerOnboarding";
import { getUploadExtension, PRIVATE_ASSETS_BUCKET, optimizeImageForUpload, toStorageRef } from "@/lib/imageUpload";
import {
  ShieldAlert, ShieldCheck, Loader2, Construction, Activity,
  CheckCircle, XCircle, Clock, Upload, AlertCircle,
  RefreshCcw, FileText, Hash, Trash2, Pencil, X, Lock, Menu
} from "lucide-react";

const REQUIRED_DOCS = ["DTI", "MAYORS_PERMIT", "BIR", "VALID_ID"];
const MAX_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const DOC_META = {
  DTI:           { label: "DTI Certificate",  color: "#00FFFF", textColor: "#1A1A1A" },
  MAYORS_PERMIT: { label: "Mayor's Permit",    color: "#EC008C", textColor: "#ffffff" },
  BIR:           { label: "BIR Certificate",   color: "#FFF200", textColor: "#1A1A1A" },
  VALID_ID:      { label: "Valid ID",          color: "#1A1A1A", textColor: "#ffffff" },
};

export default function OwnerLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState]           = useState("checking");
  const [businessName, setBusinessName] = useState("");
  const [businessId, setBusinessId]   = useState(null);
  const [lifecycleState, setLifecycleState] = useState("ACTIVE");
  const [lastActivityAt, setLastActivityAt] = useState(null);
  const [lockReason, setLockReason] = useState("");
  const [userId, setUserId]           = useState(null);
  const [docStatuses, setDocStatuses] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [reactivationLoading, setReactivationLoading] = useState(false);
  const [reactivationError, setReactivationError] = useState("");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncSidebar = () => setSidebarOpen(!mediaQuery.matches);
    syncSidebar();
    mediaQuery.addEventListener?.("change", syncSidebar);
    return () => mediaQuery.removeEventListener?.("change", syncSidebar);
  }, []);

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
    const run = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { router.push("/login"); return; }
      setUserId(user.id);
      setOwnerEmail(user.email || "");
      setOwnerDisplayName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Shop owner");

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
      if (!profile || profile.role !== "BUSINESS_OWNER") { setState("unauthorized"); return; }

      const { data: business } = await supabase
        .from("businesses")
        .select("id, name, status, lifecycle_state, last_activity_at, lock_reason")
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
        setLifecycleState("ACTIVE");
        setState("unverified");
        return;
      }

      setBusinessName(business.name || "");
      setBusinessId(business.id);
      const { data: inactivityExpired } = await supabase.rpc("is_business_inactivity_expired", {
        p_business_id: business.id,
      });
      const shouldBeLocked = business.status === "APPROVED"
        && business.lifecycle_state === "ACTIVE"
        && inactivityExpired === true;
      setLifecycleState(shouldBeLocked ? "LOCKED" : (business.lifecycle_state || "ACTIVE"));
      setLastActivityAt(business.last_activity_at || null);
      setLockReason(shouldBeLocked
        ? "Automatically locked after inactivity. Sign in or contact an administrator to request reactivation."
        : (business.lock_reason || ""));

      // If already fully approved at business level, skip doc check
      if (business.status === "APPROVED") {
        setState("approved");
        return;
      }

      // Not yet approved — show portal but restrict navigation
      setState("unverified");
    };

    run();
  }, [router, loadDocs]);

  // Fetch badge counts when businessId is available
  useEffect(() => {
    if (!businessId || !userId) return;

    const fetchCounts = async () => {
      // Pending orders count
      const { count: oCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "PENDING");
      setPendingOrders(oCount || 0);

      // Unread messages — match exactly how /owner/messages counts them:
      // 1. get all conversations for this business
      const { data: convRows } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("business_id", businessId)
        .range(0, 99);
      const convIds = (convRows || []).map(c => c.id);

      if (convIds.length > 0) {
        // 2. count unread messages NOT sent by the owner (same logic as messages page)
        const { count: mCount } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .eq("is_read", false)
          .neq("sender_id", userId);
        setUnreadMessages(mCount || 0);
      } else {
        setUnreadMessages(0);
      }
    };

    fetchCounts();
    let countTimer = null;
    const scheduleFetchCounts = () => {
      window.clearTimeout(countTimer);
      countTimer = window.setTimeout(fetchCounts, 250);
    };

    // Subscribe to realtime changes for live badge updates
    const channel = supabase.channel(`owner_layout_badges:${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}` }, () => {
        scheduleFetchCounts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations', filter: `business_id=eq.${businessId}` }, () => {
        // The chat schema updates the conversation timestamp for each new
        // message, so this business-scoped channel avoids listening to every
        // message in the entire marketplace.
        scheduleFetchCounts();
      })
      .subscribe();

    return () => {
      window.clearTimeout(countTimer);
      supabase.removeChannel(channel);
    };
  }, [businessId, userId]);

  // URL protection: instead of redirecting, we will show a watermark overlay
  // The verification page is the only owner route available before approval.
  // The dashboard must remain behind the gate even when the business record
  // has not yet received all required documents.
  const ALLOWED_UNVERIFIED = ["/owner/documents"];
  const isLockedPage = state === "unverified" && !ALLOWED_UNVERIFIED.includes(pathname);
  const isLifecycleBlocked = lifecycleState === "LOCKED" || lifecycleState === "ARCHIVED";
  const inactiveDays = lastActivityAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86400000))
    : null;

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
      const uploadFile = file.type?.startsWith("image/") ? await optimizeImageForUpload(file) : file;
      const ext  = uploadFile.type?.startsWith("image/") ? getUploadExtension(uploadFile) : uploadFile.name.split(".").pop();
      const path = `documents/${userId}/${docTypeStr}-${Date.now()}.${ext}`;
      const uploadBucket = PRIVATE_ASSETS_BUCKET;
      const { error: upErr } = await supabase.storage
        .from(uploadBucket)
        .upload(path, uploadFile, {
          upsert: true,
          cacheControl: "31536000",
          contentType: uploadFile.type,
        });
      if (upErr) throw upErr;
      payload.file_url = toStorageRef(uploadBucket, path);

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
      if (!stillRejected && freshDocs.length >= REQUIRED_DOCS.length) setState("docs_pending");

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
        const storageRefMatch = doc.file_url.match(/^(private-assets|chat-images|business-documents|image-assets):(.+)$/i);
        if (storageRefMatch) {
          await supabase.storage.from(storageRefMatch[1]).remove([storageRefMatch[2]]);
        }
        const marker = "/storage/v1/object/public/business-documents/";
        const idx = doc.file_url.indexOf(marker);
        if (idx !== -1 && !storageRefMatch) {
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
      if (!stillRejected && freshDocs.length >= REQUIRED_DOCS.length) {
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
    <div className="flex min-h-screen items-center justify-center overflow-x-hidden bg-white p-6 font-sans text-[#1A1A1A]">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-8 shadow-[0_18px_45px_rgba(26,26,26,0.08)]">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="relative z-10">
          <div className="mb-6 flex items-start justify-between">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${type === "error" ? "bg-[#EC008C] text-white" : "bg-[#00FFFF] text-[#1A1A1A]"}`}>
              <Icon size={26} />
            </div>
            {badge && <span className="rounded-full bg-[#F6F6F2] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#676762]">{badge}</span>}
          </div>
          <h1 className="mb-3 text-3xl font-black tracking-tight">{title || "Loading your workspace"}</h1>
          <p className="mb-8 text-sm leading-relaxed text-[#676762]">{message}</p>
          {action && (
            <button onClick={action.onClick}
              className="w-full rounded-full bg-[#1A1A1A] py-3.5 text-sm font-black text-white transition-colors hover:bg-[#EC008C]">
              {action.label}
            </button>
          )}
          <div className="mt-8 border-t border-[#ECECE8] pt-4 text-xs text-[#676762]">
            {type === "loading" ? "This usually takes a moment." : "Please check your account access or contact support."}
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
      if (file && !ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
        setReuploadError("Upload a PNG, JPG, WEBP image, or PDF document only.");
        return;
      }
      if (file && file.size > MAX_DOCUMENT_SIZE_BYTES) {
        setReuploadError("Upload a file that is 5.00 MB or smaller.");
        return;
      }
      setReuploadError(null);

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
      <main className="owner-doc-review-page min-h-screen overflow-x-hidden bg-[#F6F6F2] text-[#1A1A1A]">
        <section className="relative overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-6 py-10 text-white md:px-10 md:py-12">
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
                  {hasRejected ? "Replace Documents" : docStatuses.length < REQUIRED_DOCS.length ? "Complete Requirements" : "Under Review"}
                </h1>
                <p className="mt-4 max-w-3xl text-xs leading-relaxed text-white/65 md:text-sm">
                  {docStatuses.length < REQUIRED_DOCS.length
                    ? `Upload the required verification documents for ${businessName} so the shop can be reviewed.`
                    : hasRejected
                      ? `One or more documents for ${businessName} were rejected. Replace the flagged files below.`
                      : `Your documents for ${businessName} are now in the admin review queue.`}
                </p>
              </div>

              <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(236,0,140,1)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Status</p>
                    <p className="mt-1 text-lg font-black uppercase tracking-tighter">
                      {hasRejected ? "Action Required" : docStatuses.length < REQUIRED_DOCS.length ? "Missing Files" : "Pending Review"}
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
    <GateUI icon={Activity} title="Loading your shop workspace"
      message="We’re checking your account and preparing your owner dashboard."
      badge="PLEASE WAIT" type="loading" />
  );

  if (state === "unauthorized") return (
    <GateUI icon={ShieldAlert} title="Access Denied"
      message="This area is available only to approved shop owner accounts."
      badge="NOT AVAILABLE" type="error"
      action={{ label: "Go to Browse", onClick: () => router.push("/browse") }} />
  );

  const isVerified = state === "approved";

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  const handleOwnerReactivate = async () => {
    if (!businessId || lifecycleState !== "LOCKED" || reactivationLoading) return;
    setReactivationLoading(true);
    setReactivationError("");

    const { data, error } = await supabase.rpc("owner_reactivate_shop", {
      p_business_id: businessId,
    });

    if (error) {
      setReactivationError(error.message || "Unable to reactivate your shop.");
      setReactivationLoading(false);
      return;
    }

    setLifecycleState(data?.lifecycle_state || "ACTIVE");
    setLastActivityAt(new Date().toISOString());
    setLockReason("");
    setReactivationLoading(false);
    router.refresh();
  };

  /* ── PORTAL (all verified and unverified owners) ── */
  return (
    <div className="relative flex h-screen overflow-hidden bg-[#1A1A1A]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close owner sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/55 md:hidden"
        />
      )}
      <OwnerSidebar
        businessName={businessName}
        ownerDisplayName={ownerDisplayName}
        ownerEmail={ownerEmail}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((current) => !current)}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        isVerified={isVerified}
        pendingOrders={pendingOrders}
        unreadMessages={unreadMessages}
      />
      <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#F6F6F2] pt-14 md:pt-0">
        <button
          type="button"
          aria-label="Open owner sidebar"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A1A1A] text-[#00FFFF] shadow-lg md:hidden"
        >
          <Menu size={20} />
        </button>
        <div className="min-h-full w-full relative">
          {isLifecycleBlocked ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/90 p-6 backdrop-blur-sm">
              <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-7 shadow-[0_18px_42px_rgba(26,26,26,0.16)] sm:p-10">
                <div className="cmyk-bar absolute left-0 right-0 top-0" />
                <div className="mt-2 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-[#EC008C]">Shop access</p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
                      {lifecycleState === "LOCKED" ? "Your shop is locked." : "Your shop is archived."}
                    </h2>
                  </div>
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#1A1A1A] text-[#FFF200]">
                    <Lock size={26} />
                  </div>
                </div>

                <p className="mt-6 border-l-4 border-[#EC008C] bg-[#F6F6F2] px-4 py-4 text-sm font-semibold leading-relaxed text-slate-700">
                  {lifecycleState === "LOCKED"
                    ? "Your shop was locked because it was inactive. Customers cannot place new orders while it is locked."
                    : "Your shop was archived by an administrator. Your account and historical records are still preserved."}
                </p>

                <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Last activity</p>
                    <p className="mt-2 font-bold text-slate-900">{lastActivityAt ? new Date(lastActivityAt).toLocaleString() : "Not recorded"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Days inactive</p>
                    <p className="mt-2 font-bold text-slate-900">{inactiveDays === null ? "—" : inactiveDays}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Lock reason</p>
                    <p className="mt-2 font-bold text-slate-900">{lockReason || (lifecycleState === "ARCHIVED" ? "Archived by admin" : "Inactive shop")}</p>
                  </div>
                </div>

                <div className="mt-7 border-t border-slate-200 pt-6">
                  {lifecycleState === "LOCKED" ? (
                    <>
                      <p className="text-sm leading-relaxed text-slate-600">
                        Review your shop information, then reactivate it when you are ready. Reactivation makes the approved shop visible to customers again and starts a new activity period.
                      </p>
                      {reactivationError && (
                        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                          {reactivationError}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={handleOwnerReactivate}
                        disabled={reactivationLoading}
                        className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[#00FFFF] px-5 py-3.5 text-sm font-black text-[#1A1A1A] transition-colors hover:bg-[#EC008C] hover:text-white disabled:cursor-wait disabled:opacity-60"
                      >
                        {reactivationLoading ? "Reactivating shop…" : "Reactivate my shop"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-slate-600">
                        Archived shops cannot be reactivated by owners. Contact an administrator from your registered owner email if you need to request a review.
                      </p>
                      <a
                        href="mailto:admin@pressandpresent.app?subject=Shop reactivation request"
                        className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[#1A1A1A] px-5 py-3.5 text-sm font-black text-white transition-colors hover:bg-[#00FFFF] hover:text-[#1A1A1A]"
                      >
                        Contact admin about reactivation
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : isLockedPage ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/90 p-6 backdrop-blur-sm">
               <div className="relative max-w-2xl overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-8 text-center shadow-[0_18px_42px_rgba(26,26,26,0.16)] sm:p-12">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-[#EC008C] opacity-10 rotate-45 transform translate-x-16 -translate-y-16" />
                 
                 <Lock className="w-24 h-24 mx-auto text-[#EC008C] mb-8" />
                 <h2 className="mb-6 text-4xl font-black tracking-tight leading-none sm:text-6xl">
                   Shop <span className="text-[#EC008C]">locked</span>
                 </h2>
                 <p className="mb-10 border-l-2 border-[#EC008C] pl-4 text-left text-sm leading-relaxed text-gray-600">
                   This module is restricted. You must complete your business document verification to unlock shop management tools, inventory, and messaging.
                 </p>
                 <button 
                   onClick={() => router.push('/owner/documents')} 
                   className="w-full rounded-full bg-[#1A1A1A] px-8 py-3.5 text-sm font-extrabold text-white transition-all hover:bg-[#00FFFF] hover:text-[#1A1A1A]"
                 >
                   VERIFY DOCUMENTS NOW
                 </button>
               </div>
            </div>
          ) : (
            <OwnerOnboarding mode={isVerified ? "approved" : "verification"}>
              {children}
            </OwnerOnboarding>
          )}
        </div>
      </main>
    </div>
  );
}
