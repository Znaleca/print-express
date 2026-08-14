"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  FileText, CheckCircle, XCircle, Clock, Eye, AlertCircle, Loader2, X, Upload, ShieldCheck, File, Info, Image as ImageIcon
} from "lucide-react";
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${businessId}/${docType.toLowerCase()}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('business-documents')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('business-documents')
        .getPublicUrl(fileName);
      const existingDoc = docStatuses.find((d) => getDocType(d) === docType);
      const metadata = {
        file_name: file.name,
        file_size_bytes: file.size,
        file_type: file.type,
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
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading verification status...</p>
        </div>
      </main>
    );
  }
  const approvedCount = docStatuses.filter(d => d.status === "APPROVED").length;
  return (
    <>
      {/* Large Document Preview Modal */}
      {previewDocUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm" onClick={() => setPreviewDocUrl(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-6xl w-full p-6" onClick={(e) => e.stopPropagation()}>
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
      <main className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
        
        {/* Header Banner */}
        <section className="bg-white border-b border-slate-200 py-8 px-4 sm:px-6 lg:px-8 relative shadow-sm">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Business Verification Documents</h1>
              <p className="mt-1 text-xs text-slate-500">Submit legal permits and tax documents to earn your Verified Shop badge.</p>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-900 text-xs font-bold border border-slate-200">
              <ShieldCheck size={18} className="text-[#00E5FF]" />
              <span>{approvedCount} of 4 Documents Verified</span>
            </div>
          </div>
        </section>
        {/* Upload Parameters Helper Banner */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-start gap-3 text-xs text-slate-600">
            <Info size={18} className="text-[#EC008C] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-slate-900">Document Upload Specifications & Requirements:</p>
              <p className="text-[#1A1A1A]/70">
                Type: business verification document | Format: PNG, JPG, WEBP, or PDF | Size: maximum 5.0 MB per file | Quality: {SCAN_QUALITY_LABEL}
              </p>
            </div>
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
              <div key={docType} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
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
