"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";
import {
  FileText, CheckCircle, XCircle, Clock, Eye, AlertCircle, Loader2, X, Upload, ShieldCheck, File, Info, Image as ImageIcon,
  LockKeyhole, Send, MessageSquare
} from "lucide-react";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";
const REQUIRED_DOCS = ["DTI", "MAYORS_PERMIT", "BIR", "VALID_ID"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "application/pdf": "PDF",
};
const SCAN_QUALITY_LABEL = "300 DPI clear scan or sharp unedited photo";
const DOC_META = {
  DTI:           { label: "DTI Registration Certificate", desc: "Department of Trade and Industry Business Name Registration" },
  MAYORS_PERMIT: { label: "Mayor's Business Permit",    desc: "Valid Business Permit from the City/Municipal Hall" },
  BIR:           { label: "BIR Certificate of Registration", desc: "Form 2303 Certificate of Registration with TIN" },
  VALID_ID:      { label: "Government Issued Valid ID",  desc: "Passport, Driver's License, UMID, or National ID of Owner" },
};
export default function OwnerDocuments() {
  const [loading, setLoading] = useState(true);
  const [docStatuses, setDocStatuses] = useState([]);
  const [businessName, setBusinessName] = useState("");
  const [businessId, setBusinessId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [businessProfile, setBusinessProfile] = useState({ description: "", products_summary: "" });
  const [profileRequests, setProfileRequests] = useState([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ description: "", products_summary: "", reason: "" });
  const [profileRequestLoading, setProfileRequestLoading] = useState(false);
  const [profileRequestError, setProfileRequestError] = useState(null);
  const [previewDocUrl, setPreviewDocUrl] = useState(null);
  const [reuploadFiles, setReuploadFiles] = useState({});
  const [reuploadPreviews, setReuploadPreviews] = useState({});
  const [globalLoading, setGlobalLoading] = useState(false);
  const [reuploadError, setReuploadError] = useState(null);
  const getDocType = (doc) => doc?.doc_type || doc?.document_type;
  const getFileName = (doc) => {
    if (doc?.file_name) return doc.file_name;
    if (!doc?.file_url) return "";
    try {
      return decodeURIComponent(doc.file_url.split("/").pop() || "Uploaded document");
    } catch {
      return "Uploaded document";
    }
  };
  const formatFileSize = (bytes) => bytes ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : "Size not stored";
  const getFileFormat = (fileOrDoc) => {
    if (fileOrDoc?.file_format) return fileOrDoc.file_format;
    if (fileOrDoc?.type) return ACCEPTED_FILE_TYPES[fileOrDoc.type] || fileOrDoc.type;
    const name = fileOrDoc?.name || fileOrDoc?.file_name || fileOrDoc?.file_url || "";
    return name.includes(".") ? name.split(".").pop().toUpperCase() : "Unknown";
  };
  const validateDocumentFile = (file) => {
    if (!file) return null;
    if (!ACCEPTED_FILE_TYPES[file.type]) return "Upload a PNG, JPG, WEBP image, or PDF document only.";
    if (file.size > MAX_FILE_SIZE_BYTES) return `${file.name} is ${formatFileSize(file.size)}. Maximum allowed size is 5.00 MB.`;
    return null;
  };
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
        .select("id, name, description, products_summary")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (business) {
        setBusinessName(business.name);
        setBusinessId(business.id);
        setBusinessProfile({
          description: business.description || "",
          products_summary: business.products_summary || "",
        });
        const docs = await loadDocs(business.id);
        setDocStatuses(docs);
        const { data: requests } = await supabase
          .from("business_profile_change_requests")
          .select("id, requested_description, requested_products_summary, reason, status, admin_comment, created_at, reviewed_at")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false });
        setProfileRequests(requests || []);
      }
      setLoading(false);
    };
    fetchDocs();
  }, [loadDocs]);

  const openProfileRequest = () => {
    const pendingRequest = profileRequests.find((request) => request.status === "PENDING");
    if (pendingRequest) return;
    setProfileDraft({
      description: businessProfile.description,
      products_summary: businessProfile.products_summary,
      reason: "",
    });
    setProfileRequestError(null);
    setProfileModalOpen(true);
  };

  const handleProfileRequest = async (event) => {
    event.preventDefault();
    if (!businessId || profileRequestLoading) return;

    const description = profileDraft.description.trim();
    const productsSummary = profileDraft.products_summary.trim();
    const reason = profileDraft.reason.trim();

    if (description.length < 20 || description.length > 800) {
      setProfileRequestError("Business background must be between 20 and 800 characters.");
      return;
    }
    if (productsSummary.length < 10 || productsSummary.length > 500) {
      setProfileRequestError("Products and services offered must be between 10 and 500 characters.");
      return;
    }
    if (reason.length < 10 || reason.length > 300) {
      setProfileRequestError("Please explain the requested change in 10–300 characters.");
      return;
    }

    setProfileRequestLoading(true);
    setProfileRequestError(null);
    const { data, error } = await supabase
      .from("business_profile_change_requests")
      .insert({
        business_id: businessId,
        requested_description: description,
        requested_products_summary: productsSummary,
        reason,
      })
      .select("id, requested_description, requested_products_summary, reason, status, admin_comment, created_at, reviewed_at")
      .single();

    if (error) {
      setProfileRequestError(error.message || "Could not submit the profile change request.");
    } else {
      setProfileRequests((current) => [data, ...current]);
      setProfileModalOpen(false);
    }
    setProfileRequestLoading(false);
  };
  const handlePreviewFile = (docType, file) => {
    if (file) {
      const validationError = validateDocumentFile(file);
      if (validationError) {
        setReuploadError(validationError);
        return;
      }
      setReuploadError(null);
    }
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
  const handleUploadDocument = async (docType) => {
    const file = reuploadFiles[docType];
    if (!file || !businessId || !userId) return;
    setGlobalLoading(true);
    setReuploadError(null);
    try {
      const uploadFile = file.type?.startsWith("image/") ? await optimizeImageForUpload(file) : file;
      const fileExt = uploadFile.type?.startsWith("image/") ? getUploadExtension(uploadFile) : uploadFile.name.split('.').pop();
      const fileName = `${businessId}/${docType.toLowerCase()}_${Date.now()}.${fileExt}`;
      const uploadBucket = uploadFile.type?.startsWith("image/") ? IMAGE_BUCKET : "business-documents";
      const { error: uploadError } = await supabase.storage
        .from(uploadBucket)
        .upload(fileName, uploadFile, {
          upsert: true,
          cacheControl: "31536000",
          contentType: uploadFile.type,
        });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from(uploadBucket)
        .getPublicUrl(fileName);
      const existingDoc = docStatuses.find((d) => getDocType(d) === docType);
      const metadata = {
        file_name: file.name,
        file_size_bytes: uploadFile.size,
        file_type: uploadFile.type,
        file_format: getFileFormat(file),
        quality_requirement: SCAN_QUALITY_LABEL,
      };
      const saveDocument = async (includeMetadata = true) => {
        const basePayload = {
          file_url: publicUrl,
          status: "PENDING",
          owner_comment: "Uploaded by owner for admin verification",
          admin_comment: null,
        };
        const payload = includeMetadata ? { ...basePayload, ...metadata } : basePayload;
        if (existingDoc) {
          return supabase
            .from("business_documents")
            .update(payload)
            .eq("id", existingDoc.id);
        }
        return supabase
          .from("business_documents")
          .insert({
            business_id: businessId,
            doc_type: docType,
            ...payload,
          });
      };
      let { error: saveError } = await saveDocument(true);
      if (saveError && /column .* does not exist|schema cache/i.test(saveError.message || "")) {
        ({ error: saveError } = await saveDocument(false));
      }
      if (saveError) throw saveError;
      const updatedDocs = await loadDocs(businessId);
      setDocStatuses(updatedDocs);
      setReuploadFiles((prev) => { const next = { ...prev }; delete next[docType]; return next; });
      setReuploadPreviews((prev) => {
        const next = { ...prev };
        if (next[docType]) URL.revokeObjectURL(next[docType]);
        delete next[docType];
        return next;
      });
      alert("Document uploaded successfully for admin verification.");
    } catch (err) {
      setReuploadError(err.message || "Failed to upload document.");
    } finally {
      setGlobalLoading(false);
    }
  };
  if (loading) {
    return <OwnerPageSkeleton rows={4} />;
  }
  const approvedCount = docStatuses.filter(d => d.status === "APPROVED").length;
  return (
    <>
      {/* Large Document Preview Modal */}
      {previewDocUrl && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setPreviewDocUrl(null)}>
          <div className="dialog-surface max-w-6xl w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Eye size={18} className="text-[#00FFFF]" /> Document High-Resolution Preview
              </h3>
              <button onClick={() => setPreviewDocUrl(null)} className="p-1 text-slate-400 hover:text-slate-800"><X size={18} /></button>
            </div>
            {previewDocUrl.match(/\.(jpeg|jpg|png|webp|gif|svg)$/i) ? (
              <img src={previewDocUrl} alt="Document preview" className="w-full h-auto rounded-xl max-h-[82vh] object-contain border border-slate-200 bg-slate-50" />
            ) : (
              <iframe src={previewDocUrl} title="Doc" className="w-full h-[82vh] rounded-xl border border-slate-200" />
            )}
          </div>
        </div>
      )}
      {profileModalOpen && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setProfileModalOpen(false)}>
          <div className="dialog-surface max-w-2xl w-full p-6 sm:p-8" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#009FA0]">Admin review required</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">Request profile change</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Your current profile stays unchanged until an admin reviews and approves this request.</p>
              </div>
              <button type="button" onClick={() => setProfileModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label="Close request form">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleProfileRequest} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-800">Requested business background</label>
                <textarea
                  value={profileDraft.description}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, description: event.target.value }))}
                  maxLength={800}
                  minLength={20}
                  rows={4}
                  required
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-[#00C7C7] focus:ring-2 focus:ring-[#00C7C7]/20"
                />
                <p className="mt-1 text-right text-[10px] text-slate-400">{profileDraft.description.length}/800</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-800">Requested products &amp; services</label>
                <textarea
                  value={profileDraft.products_summary}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, products_summary: event.target.value }))}
                  maxLength={500}
                  minLength={10}
                  rows={3}
                  required
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-[#00C7C7] focus:ring-2 focus:ring-[#00C7C7]/20"
                />
                <p className="mt-1 text-right text-[10px] text-slate-400">{profileDraft.products_summary.length}/500</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-800">Why are you requesting this change?</label>
                <textarea
                  value={profileDraft.reason}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, reason: event.target.value }))}
                  maxLength={300}
                  minLength={10}
                  rows={2}
                  required
                  placeholder="e.g. We added photo printing and updated our shop description."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-[#00C7C7] focus:ring-2 focus:ring-[#00C7C7]/20"
                />
              </div>
              {profileRequestError && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{profileRequestError}</p>}
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setProfileModalOpen(false)} className="rounded-full border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={profileRequestLoading} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-xs font-black text-white hover:bg-[#EC008C] disabled:opacity-50">
                  {profileRequestLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Submit for admin review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <main className="owner-documents-page min-h-screen bg-[#F6F6F2] font-sans text-slate-900 pb-20">
        
        {/* Header Banner */}
        <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-10 pt-8 text-white sm:px-8 sm:pb-11 sm:pt-10 lg:px-10">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="relative mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">Documents</h1>
              <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">Submit clear legal and tax documents so your shop can be reviewed and verified.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-xs font-black text-white ring-1 ring-white/15">
              <ShieldCheck size={18} className="text-[#00E5FF]" />
              <span>{approvedCount} of 4 Documents Verified</span>
            </div>
          </div>
        </section>
        {/* Upload Parameters Helper Banner */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="flex items-start gap-3 rounded-3xl border border-[#D8D6CE] bg-white p-5 text-xs text-slate-600 shadow-sm">
            <Info size={18} className="text-[#EC008C] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-slate-900">Document Upload Specifications & Requirements:</p>
              <p className="text-[#1A1A1A]/70">
                Type: business verification document | Format: PNG, JPG, WEBP, or PDF | Size: maximum 5.0 MB per file | Quality: {SCAN_QUALITY_LABEL}
              </p>
            </div>
          </div>
        </section>
        {/* Read-only business profile */}
        <section className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <LockKeyhole size={17} className="text-[#EC008C]" />
                  <h2 className="text-lg font-black text-slate-900">Business profile details</h2>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">These details are read-only while your shop is verified. Request an admin review before changing customer-facing information.</p>
              </div>
              <button
                type="button"
                onClick={openProfileRequest}
                disabled={profileRequests.some((request) => request.status === "PENDING")}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#EC008C]/40 bg-[#EC008C]/5 px-4 py-2.5 text-xs font-black text-[#C40075] transition-colors hover:bg-[#EC008C]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageSquare size={14} />
                {profileRequests.some((request) => request.status === "PENDING") ? "Request pending" : "Request profile change"}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#008F91]">Business background</p>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{businessProfile.description || "Not provided yet."}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8A8200]">Products &amp; services offered</p>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{businessProfile.products_summary || "Not provided yet."}</p>
              </div>
            </div>

            {profileRequests[0] && (
              <div className={`mt-4 flex flex-col gap-2 border-l-2 p-3 text-xs sm:flex-row sm:items-start sm:justify-between ${
                profileRequests[0].status === "APPROVED" ? "border-emerald-500 bg-emerald-50 text-emerald-800" :
                profileRequests[0].status === "REJECTED" ? "border-rose-500 bg-rose-50 text-rose-800" :
                "border-amber-400 bg-amber-50 text-amber-900"
              }`}>
                <span><strong>Latest profile request:</strong> {profileRequests[0].status} · {new Date(profileRequests[0].created_at).toLocaleDateString()}</span>
                {profileRequests[0].admin_comment && <span>Admin note: {profileRequests[0].admin_comment}</span>}
              </div>
            )}
          </div>
        </section>
        {reuploadError && (
          <div className="max-w-5xl mx-auto px-4 mt-4">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle size={16} /> {reuploadError}
            </div>
          </div>
        )}
        {/* Documents Grid */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {REQUIRED_DOCS.map((docType) => {
            const docInfo = DOC_META[docType] || { label: docType, desc: "Legal document" };
            const doc = docStatuses.find(d => getDocType(d) === docType);
            const selectedFile = reuploadFiles[docType];
            const selectedPreview = reuploadPreviews[docType];
            return (
              <div key={docType} className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm">
                <div className="cmyk-bar-sm absolute top-0 left-0 right-0" />
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{docInfo.label}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{docInfo.desc}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                      doc?.status === "APPROVED" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                      doc?.status === "REJECTED" ? "bg-rose-50 text-rose-700 border border-rose-200" :
                      doc?.status === "PENDING" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                      "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}>
                      {doc?.status === "APPROVED" ? <CheckCircle size={14} /> :
                       doc?.status === "REJECTED" ? <XCircle size={14} /> :
                       doc?.status === "PENDING" ? <Clock size={14} /> :
                       <AlertCircle size={14} />}
                      {doc?.status || "Not Uploaded"}
                    </span>
                  </div>
                  {doc?.file_url && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <File size={16} className="text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{getFileName(doc)}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono shrink-0">{formatFileSize(doc.file_size_bytes)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                        <span><strong className="text-slate-700">Type:</strong> Verification file</span>
                        <span><strong className="text-slate-700">Format:</strong> {getFileFormat(doc)}</span>
                        <span><strong className="text-slate-700">Size:</strong> {formatFileSize(doc.file_size_bytes)}</span>
                        <span><strong className="text-slate-700">Quality:</strong> Clear scan</span>
                      </div>
                    </div>
                  )}
                  {doc?.admin_comment && (
                    <p className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-amber-900">
                      <strong>Admin note:</strong> {doc.admin_comment}
                    </p>
                  )}
                  {selectedFile && (
                    <div className="p-3 rounded-xl bg-cyan-50/60 border border-cyan-200 text-xs space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <File size={16} className="text-slate-500 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{selectedFile.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono shrink-0">{formatFileSize(selectedFile.size)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <span><strong className="text-slate-800">Type:</strong> Required document</span>
                        <span><strong className="text-slate-800">Format:</strong> {getFileFormat(selectedFile)}</span>
                        <span><strong className="text-slate-800">Size:</strong> {formatFileSize(selectedFile.size)}</span>
                        <span><strong className="text-slate-800">Quality:</strong> {SCAN_QUALITY_LABEL}</span>
                      </div>
                      {selectedPreview && (
                        <button
                          type="button"
                          onClick={() => setPreviewDocUrl(selectedPreview)}
                          className="w-full px-3 py-2 bg-white border border-cyan-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <ImageIcon size={14} /> Preview selected image
                        </button>
                      )}
                    </div>
                  )}
                  {doc?.file_url && (
                    <button
                      type="button"
                      onClick={() => setPreviewDocUrl(doc.file_url)}
                      className="w-full px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Eye size={15} /> View High-Res Document Preview
                    </button>
                  )}
                  {/* Upload Drop Zone */}
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center space-y-3 hover:border-slate-300 transition-colors">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => handlePreviewFile(docType, e.target.files[0])}
                      className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-[#EC008C] cursor-pointer"
                    />
                    {reuploadFiles[docType] && (
                      <button
                        type="button"
                        onClick={() => handleUploadDocument(docType)}
                        disabled={globalLoading}
                        className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-[#EC008C] transition-colors shadow-sm"
                      >
                        {globalLoading ? "Uploading..." : "Submit File for Review"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </>
  );
}
