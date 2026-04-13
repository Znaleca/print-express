"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import {
  Store, Save, Loader2, CheckCircle, AlertCircle,
  UploadCloud, ImageOff, X,
} from "lucide-react";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });


const FIELDS = [
  { key: "name", label: "Business Name", type: "text", placeholder: "e.g. Quick Print Co." },
  { key: "description", label: "Description", type: "area", placeholder: "Describe your shop and what makes you great…" },
  { key: "address", label: "Address", type: "text", placeholder: "123 Print Street, City, Province" },
  { key: "phone", label: "Phone Number", type: "text", placeholder: "+63 912 345 6789" },
  { key: "email", label: "Business Email", type: "email", placeholder: "hello@yourshop.com" },
  { key: "website", label: "Website URL", type: "url", placeholder: "https://yourshop.com" },
];

const BUCKET = "shop-logos";
const MAX_MB = 2;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

export default function ShopProfilePage() {
  const [form, setForm] = useState({
    name: "", description: "", address: "",
    phone: "", email: "", website: "", logo_url: "",
    lat: null, lng: null
  });
  const [businessId, setBusinessId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Logo upload state
  const [logoPreview, setLogoPreview] = useState(null);   // local object URL or stored URL
  const [logoFile, setLogoFile] = useState(null);   // File object (new upload)
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── Load business ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, description, address, phone, email, website, logo_url, lat, lng")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (biz) {
        setBusinessId(biz.id);
        setForm({
          name: biz.name || "",
          description: biz.description || "",
          address: biz.address || "",
          phone: biz.phone || "",
          email: biz.email || "",
          website: biz.website || "",
          logo_url: biz.logo_url || "",
          lat: biz.lat || null,
          lng: biz.lng || null,
        });
        if (biz.logo_url) setLogoPreview(biz.logo_url);
      }
      setLoading(false);
    };
    load();
  }, []);

  // ── Validate + accept a file ───────────────────────────────────
  const acceptFile = (file) => {
    if (!file) return;
    setLogoError(null);

    if (!ALLOWED.includes(file.type)) {
      setLogoError("Only JPG, PNG, WebP, GIF, or SVG files are allowed.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setLogoError(`File is too large. Max size is ${MAX_MB} MB.`);
      return;
    }

    setLogoFile(file);
    // Create local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
  };

  const handleFileInput = (e) => acceptFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    setForm((f) => ({ ...f, logo_url: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Upload to Supabase Storage ─────────────────────────────────
  const uploadLogo = async () => {
    if (!logoFile || !businessId) return form.logo_url;

    setLogoUploading(true);
    const ext = logoFile.name.split(".").pop();
    const filePath = `${businessId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, logoFile, { upsert: true, contentType: logoFile.type });

    setLogoUploading(false);

    if (uploadError) {
      setLogoError(`Upload failed: ${uploadError.message}`);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    // Bust CDN cache with a timestamp
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  // ── Save form ──────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!businessId) return;
    setSaving(true);
    setToast(null);

    // Upload logo first if a new file was chosen
    let finalLogoUrl = form.logo_url;
    if (logoFile) {
      const uploaded = await uploadLogo();
      if (uploaded === null) {
        setSaving(false);
        return; // Upload failed — error already set
      }
      finalLogoUrl = uploaded;
    }

    const payload = { ...form, logo_url: finalLogoUrl, updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from("businesses")
      .update(payload)
      .eq("id", businessId);

    setSaving(false);

    if (error) {
      setToast({ type: "error", msg: `Save failed: ${error.message}` });
    } else {
      setForm((f) => ({ ...f, logo_url: finalLogoUrl }));
      setLogoFile(null); // clear pending file — preview stays
      setToast({ type: "success", msg: "Shop profile saved!" });
      setTimeout(() => setToast(null), 3500);
    }
  };

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="owner-page">
        <div className="owner-loading">
          <Loader2 className="animate-spin" size={24} />
          Loading shop profile…
        </div>
      </div>
    );
  }

  const isBusy = saving || logoUploading;

  return (
    <div className="owner-page">
      {/* Header */}
      <div className="owner-page__header">
        <div>
          <h1 className="owner-page__title"><Store size={28} /> My Shop</h1>
          <p className="owner-page__subtitle">Update your public shop profile and contact info.</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`owner-toast owner-toast--${toast.type}`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSave} className="shop-form">

        {/* ── Location Picker ── */}
        <div className="shop-form__field shop-form__field--full">
          <label className="shop-form__label">Store Location (Map)</label>
          <p className="text-xs text-gray-500 mb-2">Click on the map to set your store's location. This helps customers find you.</p>
          <LocationPicker
            lat={form.lat}
            lng={form.lng}
            onChange={(lat, lng) => setForm(f => ({ ...f, lat, lng }))}
          />
        </div>

        {/* ── Logo Uploader ── */}
        <div className="shop-form__field shop-form__field--full">
          <label className="shop-form__label">Shop Logo</label>

          <div className="logo-upload-area">
            {/* Preview side */}
            {logoPreview ? (
              <div className="logo-preview-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="logo-preview-img"
                  onError={() => setLogoPreview(null)}
                />
                <div className="logo-preview-info">
                  {logoFile ? (
                    <>
                      <span className="logo-preview-filename">{logoFile.name}</span>
                      <span className="logo-preview-size">
                        {(logoFile.size / 1024).toFixed(0)} KB · {logoFile.type.split("/")[1].toUpperCase()}
                      </span>
                    </>
                  ) : (
                    <span className="logo-preview-filename">Current logo</span>
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="logo-remove-btn"
                  >
                    <X size={13} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              /* Drop zone */
              <div
                className={`logo-dropzone ${dragOver ? "logo-dropzone--over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                aria-label="Upload logo"
              >
                {dragOver
                  ? <UploadCloud size={36} className="logo-dropzone__icon logo-dropzone__icon--active" />
                  : <ImageOff size={36} className="logo-dropzone__icon" />
                }
                <p className="logo-dropzone__title">
                  {dragOver ? "Drop to upload" : "Upload shop logo"}
                </p>
                <p className="logo-dropzone__hint">
                  Drag & drop or <span className="logo-dropzone__link">browse files</span>
                </p>
                <p className="logo-dropzone__formats">JPG, PNG, WebP, GIF, SVG · max {MAX_MB} MB</p>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              id="logo-file-input"
              type="file"
              accept={ALLOWED.join(",")}
              onChange={handleFileInput}
              className="logo-file-input-hidden"
            />

            {/* Change button when preview is shown */}
            {logoPreview && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="logo-change-btn"
              >
                <UploadCloud size={14} /> Change Logo
              </button>
            )}
          </div>

          {/* Logo error */}
          {logoError && (
            <div className="logo-error">
              <AlertCircle size={13} /> {logoError}
            </div>
          )}

          {/* Upload indicator */}
          {logoUploading && (
            <div className="logo-uploading">
              <Loader2 size={13} className="animate-spin" /> Uploading logo…
            </div>
          )}
        </div>

        {/* ── Other Fields ── */}
        <div className="shop-form__grid">
          {FIELDS.map(({ key, label, type, placeholder }) => (
            <div
              key={key}
              className={`shop-form__field ${type === "area" ? "shop-form__field--full" : ""}`}
            >
              <label className="shop-form__label" htmlFor={`field-${key}`}>{label}</label>
              {type === "area" ? (
                <textarea
                  id={`field-${key}`}
                  value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  rows={4}
                  className="shop-form__textarea"
                />
              ) : (
                <input
                  id={`field-${key}`}
                  type={type}
                  value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  className="shop-form__input"
                />
              )}
            </div>
          ))}
        </div>

        {/* Save button */}
        <div className="shop-form__actions">
          <button type="submit" className="owner-btn owner-btn--primary" disabled={isBusy}>
            {isBusy
              ? <><Loader2 size={15} className="animate-spin" /> {logoUploading ? "Uploading…" : "Saving…"}</>
              : <><Save size={15} /> Save Changes</>
            }
          </button>
        </div>
      </form>
    </div>
  );
}
