"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  FileText, CheckCircle, XCircle, Clock, Eye, AlertCircle, Loader2, X, Pencil, Trash2, Upload
} from "lucide-react";

const REQUIRED_DOCS = ["DTI", "MAYORS_PERMIT", "BIR", "VALID_ID"];

const DOC_META = {
  DTI:           { label: "DTI Certificate",  color: "#00FFFF", textColor: "#1A1A1A" },
  MAYORS_PERMIT: { label: "Mayor's Permit",    color: "#EC008C", textColor: "#ffffff" },
  BIR:           { label: "BIR Certificate",   color: "#FFF200", textColor: "#1A1A1A" },
  VALID_ID:      { label: "Valid ID",          color: "#1A1A1A", textColor: "#ffffff" },
};

export default function OwnerDocuments() {
  const [loading, setLoading] = useState(true);
  const [docStatuses, setDocStatuses] = useState([]);
  const [businessName, setBusinessName] = useState("");
  const [businessId, setBusinessId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [previewDocUrl, setPreviewDocUrl] = useState(null);

  // Edit/Reupload state
  const [reuploadFiles, setReuploadFiles] = useState({});
  const [reuploadPreviews, setReuploadPreviews] = useState({});
  const [reuploadComments, setReuploadComments] = useState({});
  const [globalLoading, setGlobalLoading] = useState(false);
  const [deleteDocLoading, setDeleteDocLoading] = useState({});
  const [editSubmissionOpen, setEditSubmissionOpen] = useState({});
  const [reuploadError, setReuploadError] = useState(null);

  const loadDocs = useCallback(async (bizId) => {
    const { data } = await supabase
      .from("business_documents")
      .select("*")
      .eq("business_id", bizId);
    return data || [];
  }, []);

  useEffect(() => {
    const fetchDocs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: business } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (business) {
        setBusinessName(business.name);
        setBusinessId(business.id);
        const docs = await loadDocs(business.id);
        setDocStatuses(docs);
      }
      setLoading(false);
    };

    fetchDocs();
  }, [loadDocs]);

  useEffect(() => {
    return () => {
      Object.values(reuploadPreviews).forEach((previewUrl) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      });
    };
  }, [reuploadPreviews]);

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

  const handleSubmitAll = async () => {
    setReuploadError(null);
    const docsToUpload = Object.keys(reuploadFiles).filter(k => reuploadFiles[k]);
    if (docsToUpload.length === 0) return;

    setGlobalLoading(true);

    try {
      for (const docTypeStr of docsToUpload) {
        const file = reuploadFiles[docTypeStr];
        const doc = docStatuses.find((d) => d.doc_type === docTypeStr);

        let payload = {
          business_id: businessId,
          doc_type: docTypeStr,
          status: "PENDING",
          owner_comment: reuploadComments[docTypeStr] || null,
          admin_comment: null,
        };

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
      }
      
      // Update business status to PENDING so admin checks again
      await supabase.from("businesses").update({ status: "PENDING" }).eq("id", businessId);

      // Refresh doc statuses
      const freshDocs = await loadDocs(businessId);
      setDocStatuses(freshDocs);

      // Clear local state
      setReuploadFiles({});
      setReuploadPreviews({});
      setReuploadComments({});
      setEditSubmissionOpen({});
    } catch (err) {
      setReuploadError(err.message);
    } finally {
      setGlobalLoading(false);
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
      
      // Update business status to PENDING
      await supabase.from("businesses").update({ status: "PENDING" }).eq("id", businessId);

      const freshDocs = await loadDocs(businessId);
      setDocStatuses(freshDocs);

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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center font-mono uppercase text-[#1A1A1A]">
        <Loader2 className="mr-2 animate-spin" size={24} /> Loading documents...
      </div>
    );
  }

  const docMap = Object.fromEntries(docStatuses.map((d) => [d.doc_type, d]));
  
  const missingDocs = REQUIRED_DOCS.filter(type => {
    const doc = docMap[type];
    return (!doc || doc.status === "NOT_SUBMITTED") && !reuploadFiles[type];
  });
  const hasChanges = Object.keys(reuploadFiles).length > 0;
  const isSubmitDisabled = globalLoading || missingDocs.length > 0 || !hasChanges;

  return (
    <main className="bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden min-h-screen">
      {previewDocUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="relative w-full max-w-4xl h-[85vh] border-4 border-black bg-white p-3 shadow-[10px_10px_0px_0px_rgba(0,255,255,1)] flex flex-col">
            <div className="flex justify-between items-center mb-3 px-1">
              <h3 className="font-black uppercase tracking-tighter text-xl">Document Preview</h3>
              <button 
                onClick={() => setPreviewDocUrl(null)}
                className="bg-[#EC008C] text-white p-1 border-2 border-black hover:bg-black transition-all"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 border-4 border-black overflow-hidden bg-gray-100 flex items-center justify-center">
              {previewDocUrl.toLowerCase().endsWith(".pdf") ? (
                <iframe src={previewDocUrl} className="w-full h-full border-none" />
              ) : (
                <img src={previewDocUrl} alt="Document preview" className="max-w-full max-h-full object-contain" />
              )}
            </div>
          </div>
        </div>
      )}

      <section className="relative z-20 border-b-8 border-[#1A1A1A] px-6 py-12 md:px-10 md:py-14">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative mx-auto w-full max-w-[1920px]">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]">
            <span className="flex gap-1">
              <span className="h-2 w-2 bg-[#00FFFF]" />
              <span className="h-2 w-2 bg-[#EC008C]" />
              <span className="h-2 w-2 bg-[#FFF200]" />
            </span>
            Compliance_Hub // {businessName || "Business"}
          </div>

          <div className="mt-8">
            <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-[0.95] md:text-7xl">
              Document_<span className="bg-[#1A1A1A] px-4 py-1 text-white not-italic">Verifications</span>
            </h1>
            <p className="mt-4 max-w-3xl font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed text-gray-600 md:text-sm">
              View your uploaded business registration files and check their verification statuses.
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-20 border-b-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-6 px-6 font-mono text-[10px] font-black uppercase tracking-[0.35em] md:px-10">
          <span className="text-[#00FFFF]">Cyan</span>
          <span className="text-[#EC008C]">Magenta</span>
          <span className="text-[#FFF200]">Yellow</span>
          <span className="text-white">Black</span>
          <FileText size={14} className="text-white" />
        </div>
      </div>

      <section className="relative z-10 mx-auto w-full max-w-[1920px] bg-transparent px-6 py-9 md:px-10 md:py-14">
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
            const isEditing = status === "NOT_SUBMITTED" || !!editSubmissionOpen[docType];

            return (
              <div
                key={docType}
                className="overflow-hidden border-4 border-[#1A1A1A] bg-white shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]"
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
                        {status === "REJECTED" && doc?.admin_comment && (
                          <div className="border-4 border-[#EC008C] bg-[#FFF4FA] p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#EC008C]">Admin Feedback</p>
                            <p className="mt-2 font-mono text-[11px] uppercase leading-relaxed text-[#1A1A1A]">
                              {doc.admin_comment}
                            </p>
                          </div>
                        )}
                        {doc?.file_url ? (
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => setPreviewDocUrl(doc.file_url)}
                              className="inline-flex items-center gap-2 bg-[#1A1A1A] text-white px-4 py-3 font-mono text-[10px] font-black uppercase tracking-widest hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]"
                            >
                              <Eye size={14} /> View Uploaded File
                            </button>
                          </div>
                        ) : (
                          <div className="font-mono text-[10px] uppercase text-gray-500">
                            No file uploaded yet.
                          </div>
                        )}
                      </div>
                      
                      {/* Submission Actions */}
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
                                  disabled={globalLoading}
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
                              disabled={globalLoading}
                            />

                            {doc && (
                              <button
                                onClick={() => {
                                  setEditSubmissionOpen((p) => ({ ...p, [docType]: false }));
                                  setReuploadFiles((p) => { const n = { ...p }; delete n[docType]; return n; });
                                }}
                                disabled={globalLoading}
                                className="mt-4 flex w-full items-center justify-center gap-2 border-2 border-[#1A1A1A] bg-white px-4 py-3 font-black uppercase tracking-[0.25em] text-[#1A1A1A] transition-all hover:bg-[#FFF200] disabled:opacity-50"
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

        {/* Global Submit Button */}
        <div className="mt-12 p-8 bg-white border-8 border-[#1A1A1A] shadow-[16px_16px_0px_0px_rgba(236,0,140,1)] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="font-black uppercase tracking-tighter text-2xl italic">Submit Requirements</h3>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500 mt-2">
              {missingDocs.length > 0 
                ? `You must upload ${missingDocs.length} more document${missingDocs.length > 1 ? 's' : ''} to proceed.`
                : !hasChanges 
                  ? "Make changes to a document to enable the submit button."
                  : "All requirements met. Ready for submission."}
            </p>
          </div>
          <button
            onClick={handleSubmitAll}
            disabled={isSubmitDisabled}
            className="bg-[#1A1A1A] text-white px-10 py-5 font-black text-xl uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#00FFFF] hover:text-[#1A1A1A] disabled:opacity-50 disabled:hover:bg-[#1A1A1A] disabled:hover:text-white transition-all shadow-[6px_6px_0px_0px_rgba(0,255,255,1)] active:translate-x-1 active:translate-y-1 active:shadow-none min-w-[280px]"
          >
            {globalLoading ? (
              <><Loader2 size={24} className="animate-spin" /> Processing</>
            ) : (
              <><Upload size={24} /> Submit Files</>
            )}
          </button>
        </div>
      </section>
    </main>
  );
}
