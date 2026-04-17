"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import {
  Store, Save, Loader2, CheckCircle, AlertCircle,
  UploadCloud, ImageOff, X, Printer,
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
    lat: null, lng: null,
    min_downpayment_percent: 30,
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
        .select("id, name, description, address, phone, email, website, logo_url, lat, lng, min_downpayment_percent")
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
          min_downpayment_percent: Math.min(100, Math.max(1, Number.parseInt(String(biz.min_downpayment_percent ?? 30), 10) || 30)),
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

    const normalizedMinDownpayment = Math.min(
      100,
      Math.max(1, Number.parseInt(String(form.min_downpayment_percent ?? 30), 10) || 30)
    );

    const payload = {
      ...form,
      min_downpayment_percent: normalizedMinDownpayment,
      logo_url: finalLogoUrl,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("businesses")
      .update(payload)
      .eq("id", businessId);

    setSaving(false);

    if (error) {
      setToast({ type: "error", msg: `Save failed: ${error.message}` });
    } else {
      setForm((f) => ({
        ...f,
        logo_url: finalLogoUrl,
        min_downpayment_percent: normalizedMinDownpayment,
      }));
      setLogoFile(null); // clear pending file — preview stays
      setToast({ type: "success", msg: "Shop profile saved!" });
      setTimeout(() => setToast(null), 3500);
    }
  };

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const fieldLabelClass = "mb-2 block font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/70";
  const inputClass = "w-full border-2 border-[#1A1A1A]/20 bg-white px-3 py-2 text-sm text-[#1A1A1A] outline-none transition-colors focus:border-[#00FFFF]";

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full max-w-[1920px] bg-transparent px-6 py-9 md:px-10">
        <div className="flex items-center gap-3 py-16 font-mono text-[13px] text-[#555]">
          <Loader2 className="animate-spin" size={24} />
          Loading shop profile...
        </div>
      </div>
    );
  }

  const isBusy = saving || logoUploading;

  return (
    <main className="bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden">
      <section className="relative z-20 border-b-8 border-[#1A1A1A] px-6 py-12 md:px-10 md:py-14">
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
            Shop_Profile // Node_Identity
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-[0.95] md:text-7xl">
                My_<span className="bg-[#1A1A1A] px-4 py-1 text-white not-italic">Shop Console</span>
              </h1>
              <p className="mt-4 max-w-3xl font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed text-gray-600 md:text-sm">
                Configure your business identity, location intelligence, and public profile details for discovery.
              </p>
            </div>

            <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Profile State</p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tighter">Editing Active</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-white">
                  <Store className="h-6 w-6 text-[#00FFFF]" />
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

      <div className="relative z-20 border-b-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-6 px-6 font-mono text-[10px] font-black uppercase tracking-[0.35em] md:px-10">
          <span className="text-[#00FFFF]">Cyan</span>
          <span className="text-[#EC008C]">Magenta</span>
          <span className="text-[#FFF200]">Yellow</span>
          <span className="text-white">Black</span>
          <Printer size={14} className="text-white" />
        </div>
      </div>

      <section className="relative z-10 mx-auto w-full max-w-[1920px] bg-transparent px-6 py-9 md:px-10 md:py-14">
        {/* Toast */}
        {toast && (
          <div className={`mb-6 inline-flex items-center gap-2 border-2 px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] ${toast.type === "success" ? "border-[#1A1A1A] bg-[#FFF200] text-[#1A1A1A]" : "border-[#EC008C] bg-[#FFF4FA] text-[#EC008C]"}`}>
            {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {toast.msg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6 border-4 border-[#1A1A1A] bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] md:p-8">

        {/* ── Location Picker ── */}
        <div>
          <label className={fieldLabelClass}>Store Location (Map)</label>
          <p className="text-xs text-gray-500 mb-2">Click on the map to set your store's location. This helps customers find you.</p>
          <LocationPicker
            lat={form.lat}
            lng={form.lng}
            onChange={(lat, lng) => setForm(f => ({ ...f, lat, lng }))}
          />
        </div>

        {/* ── Logo Uploader ── */}
        <div>
          <label className={fieldLabelClass}>Shop Logo</label>

          <div className="space-y-3">
            {/* Preview side */}
            {logoPreview ? (
              <div className="flex flex-col gap-4 rounded border-2 border-[#1A1A1A]/15 bg-[#F9F9F7] p-4 md:flex-row md:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-24 w-24 border-2 border-[#1A1A1A] bg-white object-contain"
                  onError={() => setLogoPreview(null)}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {logoFile ? (
                    <>
                      <span className="truncate font-black uppercase tracking-tight text-[#1A1A1A]">{logoFile.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#666]">
                        {(logoFile.size / 1024).toFixed(0)} KB · {logoFile.type.split("/")[1].toUpperCase()}
                      </span>
                    </>
                  ) : (
                    <span className="font-black uppercase tracking-tight text-[#1A1A1A]">Current logo</span>
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="mt-1 inline-flex w-fit items-center gap-1 border-2 border-[#1A1A1A] bg-white px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#1A1A1A] transition-colors hover:bg-[#EC008C] hover:text-white"
                  >
                    <X size={13} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              /* Drop zone */
              <div
                className={`cursor-pointer rounded border-4 border-dashed px-6 py-10 text-center transition-colors ${dragOver ? "border-[#00FFFF] bg-[#EFFFFF]" : "border-[#1A1A1A]/20 bg-[#F9F9F7] hover:border-[#EC008C]"}`}
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
                  ? <UploadCloud size={36} className="mx-auto mb-2 text-[#00FFFF]" />
                  : <ImageOff size={36} className="mx-auto mb-2 text-[#999]" />
                }
                <p className="font-black uppercase tracking-tight text-[#1A1A1A]">
                  {dragOver ? "Drop to upload" : "Upload shop logo"}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#666]">
                  Drag & drop or <span className="font-black text-[#EC008C]">browse files</span>
                </p>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#999]">JPG, PNG, WebP, GIF, SVG · max {MAX_MB} MB</p>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              id="logo-file-input"
              type="file"
              accept={ALLOWED.join(",")}
              onChange={handleFileInput}
              className="hidden"
            />

            {/* Change button when preview is shown */}
            {logoPreview && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#EC008C]"
              >
                <UploadCloud size={14} /> Change Logo
              </button>
            )}
          </div>

          {/* Logo error */}
          {logoError && (
            <div className="mt-3 inline-flex items-center gap-2 border-2 border-[#EC008C] bg-[#FFF4FA] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#EC008C]">
              <AlertCircle size={13} /> {logoError}
            </div>
          )}

          {/* Upload indicator */}
          {logoUploading && (
            <div className="mt-3 inline-flex items-center gap-2 border-2 border-[#1A1A1A]/15 bg-[#F9F9F7] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#666]">
              <Loader2 size={13} className="animate-spin" /> Uploading logo...
            </div>
          )}
        </div>

        {/* ── Other Fields ── */}
        <div className="grid gap-4 md:grid-cols-2">
          {FIELDS.map(({ key, label, type, placeholder }) => (
            <div
              key={key}
              className={type === "area" ? "md:col-span-2" : ""}
            >
              <label className={fieldLabelClass} htmlFor={`field-${key}`}>{label}</label>
              {type === "area" ? (
                <textarea
                  id={`field-${key}`}
                  value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  rows={4}
                  className={`${inputClass} resize-y`}
                />
              ) : (
                <input
                  id={`field-${key}`}
                  type={type}
                  value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  className={inputClass}
                />
              )}
            </div>
          ))}
        </div>

        <div className="border-2 border-[#1A1A1A]/15 bg-[#F9F9F7] p-4">
          <label className={fieldLabelClass} htmlFor="field-min-downpayment">Minimum Downpayment (%)</label>
          <input
            id="field-min-downpayment"
            type="number"
            min="1"
            max="100"
            step="1"
            value={form.min_downpayment_percent}
            onChange={(e) => handleChange("min_downpayment_percent", e.target.value)}
            className="w-full border-2 border-[#1A1A1A]/20 bg-white px-3 py-2 text-sm font-black text-[#1A1A1A] outline-none transition-colors focus:border-[#00FFFF]"
          />
          <p className="mt-2 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-[#1A1A1A]/60">
            Customers must pay at least this percent as downpayment when ordering.
          </p>
        </div>

        {/* Save button */}
        <div className="flex justify-end border-t-2 border-[#1A1A1A]/10 pt-4">
          <button
            type="submit"
            className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy}
          >
            {isBusy
              ? <><Loader2 size={15} className="animate-spin" /> {logoUploading ? "Uploading..." : "Saving..."}</>
              : <><Save size={15} /> Save Changes</>
            }
          </button>
        </div>
        </form>
      </section>
    </main>
  );
}
