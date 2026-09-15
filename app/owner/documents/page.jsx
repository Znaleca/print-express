"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  getUploadExtension,
  PRIVATE_ASSETS_BUCKET,
  optimizeImageForUpload,
  resolveStorageUrl,
  toStorageRef,
} from "@/lib/imageUpload";
import {
  FileText, CheckCircle, XCircle, Clock, Eye, AlertCircle, Loader2, X, Upload, ShieldCheck, File, Info, Image as ImageIcon, Save,
  LockKeyhole, Send, MessageSquare, Trash2
} from "lucide-react";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";
import { formatProductServiceSummary, parseProductServiceSummary, PRODUCT_SERVICE_OPTIONS } from "@/lib/productServiceOptions";
const REQUIRED_DOCS = ["DTI", "MAYORS_PERMIT", "BIR", "VALID_ID"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "application/pdf": "PDF",
};
const SCAN_QUALITY_LABEL = "300 DPI clear scan or sharp unedited photo";
const IMAGE_DOCUMENT_PATTERN = /\.(jpeg|jpg|png|webp|gif|svg)$/i;
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
  const [businessStatus, setBusinessStatus] = useState("PENDING");
  const [userId, setUserId] = useState(null);
  const [businessProfile, setBusinessProfile] = useState({
    name: "",
    description: "",
    products_summary: "",
    description_review_status: "PENDING",
    products_review_status: "PENDING",
    description_admin_comment: "",
    products_admin_comment: "",
  });
  const [profileRequests, setProfileRequests] = useState([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ change_scope: "BOTH", description: "", selected_services: [], other_service: "", reason: "" });
  const [profileRequestLoading, setProfileRequestLoading] = useState(false);
  const [profileRequestError, setProfileRequestError] = useState(null);
  const [profileEditLoading, setProfileEditLoading] = useState(false);
  const [profileEditError, setProfileEditError] = useState(null);
  const [previewDocUrl, setPreviewDocUrl] = useState(null);
  const [reuploadFiles, setReuploadFiles] = useState({});
  const [reuploadPreviews, setReuploadPreviews] = useState({});
  const [uploadLoading, setUploadLoading] = useState({});
  const [deleteLoading, setDeleteLoading] = useState({});
  const [previewDocIsImage, setPreviewDocIsImage] = useState(false);
  const [reuploadError, setReuploadError] = useState(null);
  const [loadError, setLoadError] = useState("");
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
    const { data, error } = await supabase
      .from("business_documents")
      .select("*")
      .eq("business_id", bizId);
    if (error) throw error;
    return data || [];
  }, []);
  const openDocument = async (doc) => {
    const url = await resolveStorageUrl(doc?.file_url);
    if (url) {
      const fileType = String(doc?.file_type || "").toLowerCase();
      const urlPath = String(url).split(/[?#]/)[0];
      setPreviewDocIsImage(fileType.startsWith("image/") || IMAGE_DOCUMENT_PATTERN.test(urlPath));
      setPreviewDocUrl(url);
    }
    else setReuploadError("This document is unavailable or you do not have permission to view it.");
  };
  const closeDocumentPreview = () => {
    setPreviewDocUrl(null);
    setPreviewDocIsImage(false);
  };
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoadError("Sign in to manage your business documents.");
          return;
        }
        setUserId(user.id);
        const { data: business, error: businessError } = await supabase
          .from("businesses")
          .select("id, name, description, products_summary, status, lifecycle_state, description_review_status, products_review_status, description_admin_comment, products_admin_comment")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (businessError) throw businessError;
        if (business) {
          setBusinessName(business.name);
          setBusinessId(business.id);
          setBusinessStatus(String(business.status || "PENDING").toUpperCase());
          setBusinessProfile({
            name: business.name || "",
            description: business.description || "",
            products_summary: business.products_summary || "",
            description_review_status: business.description_review_status || "PENDING",
            products_review_status: business.products_review_status || "PENDING",
            description_admin_comment: business.description_admin_comment || "",
            products_admin_comment: business.products_admin_comment || "",
          });
          const docs = await loadDocs(business.id);
          setDocStatuses(docs);
          const { data: requests } = await supabase
            .from("business_profile_change_requests")
            .select("id, change_scope, requested_description, requested_products_summary, description_review_status, products_review_status, reason, status, admin_comment, created_at, reviewed_at")
            .eq("business_id", business.id)
            .order("created_at", { ascending: false });
          setProfileRequests(requests || []);
        } else {
          setLoadError("No business profile is linked to this owner account yet.");
        }
      } catch (error) {
        setLoadError(error.message || "Could not load your business documents.");
      } finally {
        setLoading(false);
      }
    };
    fetchDocs();
  }, [loadDocs]);

  // Reflect Admin document decisions and shop approval in an already-open
  // documents page without requiring a full browser refresh.
  useEffect(() => {
    if (!businessId) return undefined;

    let active = true;
    const refreshVerification = async () => {
      try {
        const [{ data: business }, docs, { data: requests }] = await Promise.all([
          supabase
            .from("businesses")
            .select("name, status, description, products_summary, description_review_status, products_review_status, description_admin_comment, products_admin_comment")
            .eq("id", businessId)
            .maybeSingle(),
          loadDocs(businessId),
          supabase
            .from("business_profile_change_requests")
            .select("id, change_scope, requested_description, requested_products_summary, description_review_status, products_review_status, reason, status, admin_comment, created_at, reviewed_at")
            .eq("business_id", businessId)
            .order("created_at", { ascending: false }),
        ]);
        if (!active) return;
        if (business) {
          setBusinessName(business.name || "");
          setBusinessStatus(String(business.status || "PENDING").toUpperCase());
          setBusinessProfile((current) => ({
            ...current,
            name: business.name || "",
            description: business.description || current.description,
            products_summary: business.products_summary || current.products_summary,
            description_review_status: business.description_review_status || current.description_review_status,
            products_review_status: business.products_review_status || current.products_review_status,
            description_admin_comment: business.description_admin_comment || "",
            products_admin_comment: business.products_admin_comment || "",
          }));
        }
        setDocStatuses(docs);
        setProfileRequests(requests || []);
      } catch {
        // Keep the last known document state if a realtime refresh is
        // temporarily unavailable; the next event or a manual reload retries.
      }
    };

    const channel = supabase
      .channel(`owner_documents_verification:${businessId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "business_documents",
        filter: `business_id=eq.${businessId}`,
      }, () => { void refreshVerification(); })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "businesses",
        filter: `id=eq.${businessId}`,
      }, () => { void refreshVerification(); })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "business_profile_change_requests",
        filter: `business_id=eq.${businessId}`,
      }, () => { void refreshVerification(); })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [businessId, loadDocs]);

  const openProfileRequest = () => {
    const pendingRequest = profileRequests.find((request) => request.status === "PENDING");
    if (pendingRequest) return;
    const parsedServices = parseProductServiceSummary(businessProfile.products_summary);
    setProfileDraft({
      change_scope: "BOTH",
      description: businessProfile.description,
      selected_services: parsedServices.selectedServices,
      other_service: parsedServices.otherService,
      reason: "",
    });
    setProfileRequestError(null);
    setProfileModalOpen(true);
  };

  const handleProfileRequest = async (event) => {
    event.preventDefault();
    if (!businessId || profileRequestLoading) return;

    const requestsDescription = ["BACKGROUND", "BOTH"].includes(profileDraft.change_scope);
    const requestsProducts = ["PRODUCTS", "BOTH"].includes(profileDraft.change_scope);
    const description = profileDraft.description.trim();
    const productsSummary = formatProductServiceSummary(profileDraft.selected_services, profileDraft.other_service);
    const reason = profileDraft.reason.trim();

    if (requestsDescription && (description.length < 20 || description.length > 800)) {
      setProfileRequestError("Business background must be between 20 and 800 characters.");
      return;
    }
    if (requestsProducts && profileDraft.selected_services.length === 0) {
      setProfileRequestError("Select at least one product or service.");
      return;
    }
    if (requestsProducts && profileDraft.selected_services.includes("Other") && !profileDraft.other_service.trim()) {
      setProfileRequestError("Describe the other product or service you selected.");
      return;
    }
    if (requestsProducts && (productsSummary.length < 10 || productsSummary.length > 500)) {
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
        change_scope: profileDraft.change_scope,
        requested_description: requestsDescription ? description : null,
        requested_products_summary: requestsProducts ? productsSummary : null,
        reason,
      })
      .select("id, change_scope, requested_description, requested_products_summary, description_review_status, products_review_status, reason, status, admin_comment, created_at, reviewed_at")
      .single();

    if (error) {
      setProfileRequestError(error.message || "Could not submit the profile change request.");
    } else {
      setProfileRequests((current) => [data, ...current]);
      setProfileModalOpen(false);
    }
    setProfileRequestLoading(false);
  };

  const toggleRequestedService = (service) => {
    setProfileDraft((current) => ({
      ...current,
      selected_services: current.selected_services.includes(service)
        ? current.selected_services.filter((item) => item !== service)
        : [...current.selected_services, service],
    }));
    setProfileRequestError(null);
  };

  const savePreApprovalProfile = async (event) => {
    event.preventDefault();
    if (!businessId || businessStatus === "APPROVED" || profileEditLoading) return;
    const description = businessProfile.description.trim();
    const productsSummary = businessProfile.products_summary.trim();
    if (description.length < 20 || description.length > 800) {
      setProfileEditError("Business background must be between 20 and 800 characters.");
      return;
    }
    if (productsSummary.length < 10 || productsSummary.length > 500) {
      setProfileEditError("Products and services must be between 10 and 500 characters.");
      return;
    }

    setProfileEditLoading(true);
    setProfileEditError(null);
    const { data, error } = await supabase
      .from("businesses")
      .update({ description, products_summary: productsSummary })
      .eq("id", businessId)
      .select("description, products_summary, description_review_status, products_review_status, description_admin_comment, products_admin_comment")
      .single();
    if (error) {
      setProfileEditError(error.message || "Could not save your business profile.");
    } else {
      setBusinessProfile((current) => ({ ...current, ...data }));
    }
    setProfileEditLoading(false);
  };

  const handlePreviewFile = (docType, file) => {
    const currentDoc = docStatuses.find((document) => getDocType(document) === docType);
    if (currentDoc?.status === "APPROVED") {
      setReuploadError(`${DOC_META[docType]?.label || "This document"} is approved and locked. Replacements are only available after an admin requests action.`);
      return;
    }
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
      }
      if (file?.type?.startsWith("image/")) {
        next[docType] = URL.createObjectURL(file);
      } else {
        next[docType] = null;
      }
      return next;
    });
  };
  const clearSelectedFile = (docType) => {
    setReuploadFiles((prev) => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
    setReuploadPreviews((prev) => {
      const next = { ...prev };
      if (next[docType]) URL.revokeObjectURL(next[docType]);
      delete next[docType];
      return next;
    });
    const input = document.getElementById(`document-upload-${docType}`);
    if (input) input.value = "";
    setReuploadError(null);
  };
  const handleDeleteDocument = async (docType, doc) => {
    if (!doc?.id || doc.status === "APPROVED" || deleteLoading[docType]) return;
    if (!window.confirm(`Remove the uploaded ${DOC_META[docType]?.label || "document"}?`)) return;

    setDeleteLoading((current) => ({ ...current, [docType]: true }));
    setReuploadError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your owner session has expired. Please sign in again.");
      const response = await fetch("/api/owner/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ businessId, documentId: doc.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to remove this document.");
      clearSelectedFile(docType);
      setDocStatuses(await loadDocs(businessId));
    } catch (error) {
      setReuploadError(error.message || "Unable to remove this document.");
    } finally {
      setDeleteLoading((current) => ({ ...current, [docType]: false }));
    }
  };
  const handleUploadDocument = async (docType) => {
    const file = reuploadFiles[docType];
    if (!file || !businessId || !userId || uploadLoading[docType]) return;
    const existingDoc = docStatuses.find((document) => getDocType(document) === docType);
    if (existingDoc?.status === "APPROVED") {
      setReuploadError(`${DOC_META[docType]?.label || "This document"} is approved and locked. Replacements are only available after an admin requests action.`);
      return;
    }
    if (existingDoc && !["REJECTED", "NEEDS_CHANGES", "ACTION_REQUIRED"].includes(existingDoc.status)) {
      setReuploadError("This document is already under review. Wait for the admin decision before submitting a replacement.");
      return;
    }
    setUploadLoading((current) => ({ ...current, [docType]: true }));
    setReuploadError(null);
    try {
      const uploadFile = file.type?.startsWith("image/") ? await optimizeImageForUpload(file) : file;
      const fileExt = uploadFile.type?.startsWith("image/") ? getUploadExtension(uploadFile) : uploadFile.name.split('.').pop();
      const fileName = `documents/${userId}/${docType.toLowerCase()}_${Date.now()}.${fileExt}`;
      const uploadBucket = PRIVATE_ASSETS_BUCKET;
      const { error: uploadError } = await supabase.storage
        .from(uploadBucket)
        .upload(fileName, uploadFile, {
          upsert: true,
          cacheControl: "31536000",
          contentType: uploadFile.type,
        });
      if (uploadError) throw uploadError;
      const storageRef = toStorageRef(uploadBucket, fileName);
      const metadata = {
        file_name: file.name,
        file_size_bytes: uploadFile.size,
        file_type: uploadFile.type,
        file_format: getFileFormat(file),
        quality_requirement: SCAN_QUALITY_LABEL,
      };
      const saveDocument = async (includeMetadata = true) => {
        const basePayload = {
          file_url: storageRef,
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
      setUploadLoading((current) => {
        const next = { ...current };
        delete next[docType];
        return next;
      });
    }
  };
  if (loading) {
    return <OwnerPageSkeleton rows={4} />;
  }
  if (!businessId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F6F2] p-6 font-sans text-slate-900">
        <div className="w-full max-w-lg rounded-3xl border border-[#D8D6CE] bg-white p-8 text-center shadow-sm">
          <FileText size={34} className="mx-auto text-[#EC008C]" />
          <h1 className="mt-4 text-2xl font-black">Documents unavailable</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{loadError || "We could not find a business profile for this account."}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-xs font-black text-white hover:bg-[#EC008C]">Reload documents</button>
        </div>
      </main>
    );
  }
  const approvedCount = docStatuses.filter(d => d.status === "APPROVED").length;
  const uploadedCount = docStatuses.filter((document) => document?.id || document?.file_url).length;
  const hasActionRequired = docStatuses.some((document) => ["REJECTED", "NEEDS_CHANGES", "ACTION_REQUIRED"].includes(document?.status));
  const allDocumentsApproved = REQUIRED_DOCS.every((docType) => docStatuses.some(
    (document) => getDocType(document) === docType && document?.status === "APPROVED",
  ));
  const shopApproved = businessStatus === "APPROVED" && allDocumentsApproved;
  const awaitingAdminApproval = allDocumentsApproved && !shopApproved;
  const overallStatus = shopApproved
    ? "Shop approved"
    : hasActionRequired
      ? "Action required"
      : awaitingAdminApproval
        ? "Documents accepted · shop locked"
        : approvedCount > 0 || uploadedCount > 0
          ? "Under review"
          : "Documents needed";
  const overallMessage = shopApproved
    ? "Your shop is approved. Keep these verification documents available for your records."
    : hasActionRequired
      ? "Replace each document marked as needing changes. Your shop stays locked until all four documents are approved."
      : awaitingAdminApproval
        ? "All four documents are approved. An Admin still needs to approve your shop before owner tools and customer visibility are unlocked."
        : "Upload the missing documents and wait for Admin review. Your shop remains locked until all four documents are approved and the shop is approved.";
  return (
    <>
      {/* Large Document Preview Modal */}
      {previewDocUrl && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={closeDocumentPreview}>
          <div className="dialog-surface flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Eye size={18} className="text-[#00FFFF]" /> Document High-Resolution Preview
              </h3>
              <button type="button" onClick={closeDocumentPreview} aria-label="Close document preview" className="p-1 text-slate-400 hover:text-slate-800"><X size={18} /></button>
            </div>
            {previewDocIsImage ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                <img src={previewDocUrl} alt="Document preview" className="block max-h-[calc(94vh-8rem)] max-w-full object-contain" />
              </div>
            ) : (
              <iframe src={previewDocUrl} title="Document preview" className="min-h-0 h-[calc(94vh-8rem)] w-full rounded-xl border border-slate-200" />
            )}
          </div>
        </div>
      )}
      {profileModalOpen && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setProfileModalOpen(false)}>
          <div className="dialog-surface max-h-[92vh] max-w-2xl w-full overflow-y-auto p-6 sm:p-8" onClick={(event) => event.stopPropagation()}>
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
              <fieldset>
                <legend className="mb-2 text-xs font-bold text-slate-800">What do you want to update?</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    ["BACKGROUND", "Business background"],
                    ["PRODUCTS", "Products & services"],
                    ["BOTH", "Both"],
                  ].map(([value, label]) => (
                    <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold transition-colors ${profileDraft.change_scope === value ? "border-[#00A5A5] bg-cyan-50 text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}>
                      <input type="radio" name="profile-change-scope" value={value} checked={profileDraft.change_scope === value} onChange={(event) => setProfileDraft((current) => ({ ...current, change_scope: event.target.value }))} className="h-4 w-4 accent-[#00A5A5]" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {["BACKGROUND", "BOTH"].includes(profileDraft.change_scope) && <div>
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
              </div>}

              {["PRODUCTS", "BOTH"].includes(profileDraft.change_scope) && <div>
                <p className="mb-1 text-xs font-bold text-slate-800">Requested products &amp; services</p>
                <p className="mb-2 text-[11px] leading-relaxed text-slate-500">Select every product or service that should appear on your updated profile.</p>
                <fieldset className="rounded-xl border border-slate-200 bg-white p-3">
                  <legend className="sr-only">Requested products and services</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PRODUCT_SERVICE_OPTIONS.map((service) => {
                      const selected = profileDraft.selected_services.includes(service);
                      const inputId = `requested-service-${service.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                      return <label key={service} htmlFor={inputId} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors ${selected ? "border-[#00A5A5] bg-cyan-50 text-slate-900" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"}`}>
                        <input id={inputId} type="checkbox" checked={selected} onChange={() => toggleRequestedService(service)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#00A5A5]" />
                        <span>{service}</span>
                      </label>;
                    })}
                  </div>
                  {profileDraft.selected_services.includes("Other") && <div className="mt-3 border-t border-slate-100 pt-3">
                    <label htmlFor="requested-other-service" className="mb-1 block text-[11px] font-bold text-slate-700">Describe your other product or service</label>
                    <input id="requested-other-service" value={profileDraft.other_service} onChange={(event) => setProfileDraft((current) => ({ ...current, other_service: event.target.value.slice(0, 160) }))} maxLength={160} required className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-[#00C7C7]" placeholder="e.g. Custom rubber stamps" />
                  </div>}
                </fieldset>
              </div>}
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
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#00FFFF]">{businessName || "Your shop"}</p>
              <h1 className="mt-2 text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">Documents</h1>
              <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">Submit clear legal and tax documents so your shop can be reviewed and verified.</p>
            </div>
            <div data-tour="owner-documents-status" className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-xs font-black text-white ring-1 ring-white/15">
              {awaitingAdminApproval ? <LockKeyhole size={18} className="text-[#FFF200]" /> : <ShieldCheck size={18} className="text-[#00E5FF]" />}
              <span>{approvedCount} of 4 Documents Approved{awaitingAdminApproval ? " · Shop locked" : ""}</span>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-5xl px-4 pt-5 sm:px-6 lg:px-8" aria-label="Verification status">
          <div className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 sm:flex-row sm:items-start sm:justify-between ${shopApproved ? "border-emerald-200 bg-emerald-50" : hasActionRequired ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`} role="status">
            <div className="flex min-w-0 items-start gap-3">
              {shopApproved ? <CheckCircle size={18} className="mt-0.5 shrink-0 text-emerald-700" /> : hasActionRequired ? <XCircle size={18} className="mt-0.5 shrink-0 text-rose-700" /> : awaitingAdminApproval ? <LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-700" /> : <Clock size={18} className="mt-0.5 shrink-0 text-amber-700" />}
              <div>
                <p className={`text-xs font-black uppercase tracking-[0.12em] ${shopApproved ? "text-emerald-900" : hasActionRequired ? "text-rose-900" : "text-amber-900"}`}>{overallStatus}</p>
                <p className={`mt-1 text-xs leading-relaxed ${shopApproved ? "text-emerald-800" : hasActionRequired ? "text-rose-800" : "text-amber-800"}`}>{overallMessage}</p>
              </div>
            </div>
            <span className="shrink-0 text-xs font-black text-slate-700">{uploadedCount}/4 uploaded</span>
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
        <section data-tour="owner-documents-profile" className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <LockKeyhole size={17} className="text-[#EC008C]" />
                  <h2 className="text-lg font-black text-slate-900">Business profile details</h2>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Preview your approved shop identity here. Business background and products &amp; services require Admin review after the shop is approved.</p>
              </div>
              {businessStatus === "APPROVED" && <button
                type="button"
                onClick={openProfileRequest}
                disabled={profileRequests.some((request) => request.status === "PENDING")}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#EC008C]/40 bg-[#EC008C]/5 px-4 py-2.5 text-xs font-black text-[#C40075] transition-colors hover:bg-[#EC008C]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageSquare size={14} />
                {profileRequests.some((request) => request.status === "PENDING") ? "Request pending" : "Request profile change"}
              </button>}
            </div>

            <div className="mt-4 rounded-2xl border border-[#00C7C7]/30 bg-[#F4FFFF] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#007C7D]">Business name</p>
              <p className="mt-2 text-sm font-black text-slate-900">{businessProfile.name || "Business name not available"}</p>
              <p className="mt-1 text-[11px] text-slate-500">Preview only on this page. Manage general shop details from the Shop Profile page when available.</p>
            </div>

            {businessStatus !== "APPROVED" && <form onSubmit={savePreApprovalProfile} className="mt-4 space-y-4 rounded-2xl border border-[#00C7C7]/30 bg-[#F4FFFF] p-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#007C7D]">Edit before approval</p><p className="mt-1 text-xs leading-relaxed text-slate-600">You may correct the background and products or services while Admin review is still in progress.</p></div>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-800">Business background</span><textarea value={businessProfile.description} onChange={(event) => setBusinessProfile((current) => ({ ...current, description: event.target.value }))} minLength={20} maxLength={800} rows={4} required className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#00C7C7]" /><span className="mt-1 block text-right text-[10px] text-slate-400">{businessProfile.description.length}/800</span></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-800">Products &amp; services</span><textarea value={businessProfile.products_summary} onChange={(event) => setBusinessProfile((current) => ({ ...current, products_summary: event.target.value }))} minLength={10} maxLength={500} rows={3} required className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#00C7C7]" /><span className="mt-1 block text-right text-[10px] text-slate-400">{businessProfile.products_summary.length}/500</span></label>
              {profileEditError && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700" role="alert">{profileEditError}</p>}
               <button type="submit" disabled={profileEditLoading} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-xs font-black text-white hover:bg-[#00A878] disabled:cursor-wait disabled:opacity-50">{profileEditLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save profile for review</button>
             </form>}

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
        <section data-tour="owner-documents-list" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {REQUIRED_DOCS.map((docType) => {
            const docInfo = DOC_META[docType] || { label: docType, desc: "Legal document" };
            const doc = docStatuses.find(d => getDocType(d) === docType);
            const isApproved = doc?.status === "APPROVED";
            const canReplace = !doc || ["REJECTED", "NEEDS_CHANGES", "ACTION_REQUIRED"].includes(doc.status);
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
                      {isApproved ? "APPROVED · LOCKED" : doc?.status || "Not Uploaded"}
                    </span>
                  </div>
                  {doc?.file_url && !selectedFile && (
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
                  {selectedFile && !isApproved && (
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
                          onClick={() => { setPreviewDocIsImage(true); setPreviewDocUrl(selectedPreview); }}
                          className="w-full px-3 py-2 bg-white border border-cyan-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <ImageIcon size={14} /> Preview selected image
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => clearSelectedFile(docType)}
                        disabled={uploadLoading[docType]}
                        className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="inline-flex items-center justify-center gap-1.5"><Trash2 size={14} /> Remove replacement file</span>
                      </button>
                    </div>
                  )}
                  {doc?.file_url && !selectedFile && (
                    <button
                      type="button"
                      onClick={() => openDocument(doc)}
                      className="w-full px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Eye size={15} /> View High-Res Document Preview
                    </button>
                  )}
                  {doc?.file_url && !isApproved && !selectedFile && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(docType, doc)}
                      disabled={deleteLoading[docType] || uploadLoading[docType]}
                      className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="inline-flex items-center justify-center gap-1.5">
                        {deleteLoading[docType] ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        {deleteLoading[docType] ? "Removing uploaded file..." : "Remove uploaded file"}
                      </span>
                    </button>
                  )}
                  {isApproved ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4" role="status">
                      <div className="flex items-start gap-3">
                        <LockKeyhole size={17} className="mt-0.5 shrink-0 text-emerald-700" />
                        <div className="min-w-0">
                          <p className="text-xs font-black text-emerald-900">Approved document locked</p>
                          <p className="mt-1 break-words text-[11px] leading-relaxed text-emerald-800">{getFileName(doc) || "Approved verification document"}</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-emerald-800/80">This file is read-only. An admin must request action before a replacement can be submitted.</p>
                          {doc?.file_url && (
                            <button
                              type="button"
                              onClick={() => openDocument(doc)}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-[11px] font-black text-emerald-900 hover:bg-emerald-200"
                            >
                              <Eye size={14} /> View approved preview
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : canReplace ? (
                    <div className="space-y-3 rounded-xl border-2 border-dashed border-slate-200 p-4 text-center transition-colors hover:border-slate-300">
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#EC008C]" htmlFor={`document-upload-${docType}`}>
                        <Upload size={14} /> {doc ? "Choose replacement file" : "Choose file to submit"}
                      </label>
                      <input
                        id={`document-upload-${docType}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => handlePreviewFile(docType, e.target.files?.[0])}
                        aria-label={doc ? "Choose replacement file" : "Choose file to submit"}
                        className="sr-only"
                      />
                      {reuploadFiles[docType] && (
                        <button
                          type="button"
                          onClick={() => handleUploadDocument(docType)}
                          disabled={uploadLoading[docType]}
                          className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {uploadLoading[docType] ? "Uploading..." : "Submit file for admin review"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
                      <div className="flex items-start gap-3">
                        <Clock size={17} className="mt-0.5 shrink-0 text-amber-700" />
                        <div>
                          <p className="text-xs font-black text-amber-900">Submitted for admin review</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-amber-800">Replacement uploads are disabled while this document is pending. You can act again if the admin rejects or requests changes.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </>
  );
}
