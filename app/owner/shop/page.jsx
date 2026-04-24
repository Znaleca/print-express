"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import {
  Store, Save, Loader2, CheckCircle, AlertCircle,
  UploadCloud, ImageOff, X, Printer, QrCode, Power, MapPin
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
    phone: "", email: "", website: "", logo_url: "", qr_url: "",
    lat: null, lng: null,
    min_downpayment_percent: 30,
  });
  const [initialForm, setInitialForm] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [isOpen, setIsOpen] = useState(true);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Logo upload state
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // QR upload state
  const [qrPreview, setQrPreview] = useState(null);
  const [qrFile, setQrFile] = useState(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [qrDragOver, setQrDragOver] = useState(false);
  const qrInputRef = useRef(null);

  // ── Load business ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, description, address, phone, email, website, logo_url, qr_url, lat, lng, min_downpayment_percent, is_open")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (biz) {
        setBusinessId(biz.id);
        const loadedForm = {
          name: biz.name || "",
          description: biz.description || "",
          address: biz.address || "",
          phone: biz.phone || "",
          email: biz.email || "",
          website: biz.website || "",
          logo_url: biz.logo_url || "",
          qr_url: biz.qr_url || "",
          lat: biz.lat || null,
          lng: biz.lng || null,
          min_downpayment_percent: Math.min(100, Math.max(1, Number.parseInt(String(biz.min_downpayment_percent ?? 30), 10) || 30)),
        };
        setForm(loadedForm);
        setInitialForm(loadedForm);
        if (biz.logo_url) setLogoPreview(biz.logo_url);
        if (biz.qr_url) setQrPreview(biz.qr_url);
        setIsOpen(biz.is_open ?? true);
      }
      setLoading(false);
    };
    load();
  }, []);

  // ── Toggle shop open/close (instant save) ────────────────────
  const handleToggleOpen = async () => {
    if (!businessId || togglingOpen) return;
    const next = !isOpen;
    setTogglingOpen(true);
    const { error } = await supabase
      .from("businesses")
      .update({ is_open: next, updated_at: new Date().toISOString() })
      .eq("id", businessId);
    setTogglingOpen(false);
    if (!error) {
      setIsOpen(next);
      setToast({ type: "success", msg: next ? "Shop is now OPEN" : "Shop is now CLOSED" });
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast({ type: "error", msg: `Failed to update: ${error.message}` });
      setTimeout(() => setToast(null), 4000);
    }
  };

  // ── Geocoding ──────────────────────────────────────────────────
  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.display_name) {
        setForm((f) => ({ ...f, address: data.display_name }));
      }
    } catch (err) {
      console.error("Reverse geocoding error:", err);
    }
  };

  const geocodeAddress = async () => {
    if (!form.address) return;
    setToast({ type: "success", msg: "Searching location..." });
    
    try {
      let lat, lng;
      const addressToSearch = form.address.trim();

      // Check for Plus Code (e.g. "MGX8+3Q Abucay, Bataan")
      const parts = addressToSearch.split(/[\s,]+/);
      const potentialCode = parts[0];

      if (potentialCode.includes("+")) {
        const { OpenLocationCode } = await import("open-location-code");
        const olc = new OpenLocationCode();

        if (olc.isFull(potentialCode)) {
          const decoded = olc.decode(potentialCode);
          lat = decoded.latitudeCenter;
          lng = decoded.longitudeCenter;
        } else if (olc.isShort(potentialCode) && parts.length > 1) {
          // If short, geocode the reference location first
          const referenceLoc = addressToSearch.replace(potentialCode, "").trim();
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(referenceLoc)}`, { headers: { 'User-Agent': 'print-app-v1' }});
          const data = await res.json();

          if (data && data.length > 0) {
            const refLat = Number.parseFloat(data[0].lat);
            const refLng = Number.parseFloat(data[0].lon);
            const fullCode = olc.recoverNearest(potentialCode, refLat, refLng);
            const decoded = olc.decode(fullCode);
            lat = decoded.latitudeCenter;
            lng = decoded.longitudeCenter;
          }
        }
      }

      // Standard geocoding fallback
      if (!lat || !lng) {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressToSearch)}`, { headers: { 'User-Agent': 'print-app-v1' }});
        const data = await res.json();
        if (data && data.length > 0) {
          lat = Number.parseFloat(data[0].lat);
          lng = Number.parseFloat(data[0].lon);
        }
      }

      if (lat && lng) {
        setForm((f) => ({ ...f, lat, lng }));
        setToast({ type: "success", msg: "Location found & pinned!" });
        setTimeout(() => setToast(null), 3000);
      } else {
        setToast({ type: "error", msg: "Location not found. Try adding more details like city or postal code." });
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setToast({ type: "error", msg: "Failed to search location." });
    }
  };

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

  // ── QR helpers ────────────────────────────────────────────────
  const acceptQrFile = (file) => {
    if (!file) return;
    setQrError(null);
    if (!ALLOWED.includes(file.type)) {
      setQrError("Only JPG, PNG, WebP, GIF, or SVG files are allowed.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setQrError(`File is too large. Max size is ${MAX_MB} MB.`);
      return;
    }
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
  };

  const handleQrFileInput = (e) => acceptQrFile(e.target.files?.[0]);

  const handleQrDrop = (e) => {
    e.preventDefault();
    setQrDragOver(false);
    acceptQrFile(e.dataTransfer.files?.[0]);
  };

  const handleRemoveQr = () => {
    setQrFile(null);
    setQrPreview(null);
    setQrError(null);
    setForm((f) => ({ ...f, qr_url: "" }));
    if (qrInputRef.current) qrInputRef.current.value = "";
  };

  const uploadQr = async () => {
    if (!qrFile || !businessId) return form.qr_url;
    setQrUploading(true);
    const ext = qrFile.name.split(".").pop();
    const filePath = `${businessId}/qr.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, qrFile, { upsert: true, contentType: qrFile.type });
    setQrUploading(false);
    if (uploadError) {
      setQrError(`Upload failed: ${uploadError.message}`);
      return null;
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    return `${urlData.publicUrl}?t=${Date.now()}`;
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
        return;
      }
      finalLogoUrl = uploaded;
    }

    // Upload QR if a new file was chosen
    let finalQrUrl = form.qr_url;
    if (qrFile) {
      const uploaded = await uploadQr();
      if (uploaded === null) {
        setSaving(false);
        return;
      }
      finalQrUrl = uploaded;
    }

    const normalizedMinDownpayment = Math.min(
      100,
      Math.max(1, Number.parseInt(String(form.min_downpayment_percent ?? 30), 10) || 30)
    );

    const payload = {
      ...form,
      min_downpayment_percent: normalizedMinDownpayment,
      logo_url: finalLogoUrl,
      qr_url: finalQrUrl,
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
      const updatedForm = {
        ...form,
        logo_url: finalLogoUrl,
        qr_url: finalQrUrl,
        min_downpayment_percent: normalizedMinDownpayment,
      };
      setForm(updatedForm);
      setInitialForm(updatedForm);
      setLogoFile(null);
      setQrFile(null);
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

  const isBusy = saving || logoUploading || qrUploading;
  const isDirty = initialForm ? JSON.stringify(form) !== JSON.stringify(initialForm) || !!logoFile || !!qrFile : false;

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

            <div className="flex flex-col gap-3">
              {/* Profile state badge */}
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

              {/* Open / Close toggle card */}
              <button
                type="button"
                onClick={handleToggleOpen}
                disabled={togglingOpen}
                className={`w-full border-4 p-5 text-left transition-all disabled:opacity-60 ${
                  isOpen
                    ? "border-[#1A1A1A] bg-[#00FFFF] shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]"
                    : "border-[#1A1A1A] bg-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(236,0,140,1)]"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className={`font-mono text-[9px] uppercase tracking-[0.35em] ${
                      isOpen ? "text-[#1A1A1A]/60" : "text-white/50"
                    }`}>Shop Status</p>
                    <p className={`mt-1 text-xl font-black uppercase tracking-tighter ${
                      isOpen ? "text-[#1A1A1A]" : "text-white"
                    }`}>
                      {togglingOpen ? "Updating…" : isOpen ? "● Open" : "○ Closed"}
                    </p>
                    <p className={`mt-1 font-mono text-[9px] uppercase tracking-[0.15em] ${
                      isOpen ? "text-[#1A1A1A]/50" : "text-white/40"
                    }`}>
                      {isOpen ? "Click to close shop" : "Click to open shop"}
                    </p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center border-2 ${
                    isOpen ? "border-[#1A1A1A] bg-[#1A1A1A]" : "border-white bg-white"
                  }`}>
                    <Power className={`h-6 w-6 ${
                      isOpen ? "text-[#00FFFF]" : "text-[#EC008C]"
                    }`} />
                  </div>
                </div>
              </button>
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

        <form onSubmit={handleSave} className="space-y-8 border-4 border-[#1A1A1A] bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] md:p-8">

        {/* ── Shop Banner Uploader (was Logo) ── */}
        <div>
          <label className={fieldLabelClass}>Shop Banner (Logo)</label>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-gray-500 mb-3">
            Upload a wide image to serve as your shop's banner on the marketplace.
          </p>

          <div className="space-y-3">
            {logoPreview ? (
              <div className="flex flex-col gap-4 rounded border-2 border-[#1A1A1A]/15 bg-[#F9F9F7] p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt="Shop Banner preview"
                  className="w-full h-48 md:h-64 object-cover border-4 border-[#1A1A1A] bg-white"
                  onError={() => setLogoPreview(null)}
                />
                <div className="flex flex-wrap items-center justify-between gap-4 px-2 pb-2">
                  <div className="flex flex-col min-w-0">
                    {logoFile ? (
                      <>
                        <span className="truncate font-black uppercase tracking-tight text-[#1A1A1A]">{logoFile.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#666]">
                          {(logoFile.size / 1024).toFixed(0)} KB · {logoFile.type.split("/")[1].toUpperCase()}
                        </span>
                      </>
                    ) : (
                      <span className="font-black uppercase tracking-tight text-[#1A1A1A]">Current Banner</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#00FFFF] hover:text-[#1A1A1A]"
                    >
                      <UploadCloud size={13} /> Change
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center gap-1 border-2 border-[#1A1A1A] bg-white px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#1A1A1A] transition-colors hover:bg-[#EC008C] hover:text-white"
                    >
                      <X size={13} /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`cursor-pointer rounded border-4 border-dashed px-6 py-14 md:py-20 text-center transition-colors ${dragOver ? "border-[#00FFFF] bg-[#EFFFFF]" : "border-[#1A1A1A]/20 bg-[#F9F9F7] hover:border-[#EC008C]"}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                aria-label="Upload shop banner"
              >
                {dragOver
                  ? <UploadCloud size={48} className="mx-auto mb-3 text-[#00FFFF]" />
                  : <ImageOff size={48} className="mx-auto mb-3 text-[#999]" />
                }
                <p className="text-xl font-black uppercase tracking-tight text-[#1A1A1A]">
                  {dragOver ? "Drop banner image here" : "Upload Shop Banner"}
                </p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#666]">
                  Drag & drop or <span className="font-black text-[#EC008C]">browse files</span>
                </p>
                <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#999]">16:9 Recommended · JPG, PNG, WebP · max {MAX_MB} MB</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              id="logo-file-input"
              type="file"
              accept={ALLOWED.join(",")}
              onChange={handleFileInput}
              className="hidden"
            />

            {logoError && (
              <div className="mt-3 inline-flex items-center gap-2 border-2 border-[#EC008C] bg-[#FFF4FA] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#EC008C]">
                <AlertCircle size={13} /> {logoError}
              </div>
            )}
            {logoUploading && (
              <div className="mt-3 inline-flex items-center gap-2 border-2 border-[#1A1A1A]/15 bg-[#F9F9F7] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#666]">
                <Loader2 size={13} className="animate-spin" /> Uploading banner...
              </div>
            )}
          </div>
        </div>

        {/* ── Shop Open / Close Toggle ── */}
        <div className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-2 p-4 ${
          isOpen ? "border-[#00FFFF] bg-[#EFFFFF]" : "border-[#1A1A1A]/20 bg-[#F4F4F4]"
        }`}>
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/70">Shop Status</p>
            <p className={`mt-0.5 text-sm font-black uppercase tracking-tight ${
              isOpen ? "text-[#008080]" : "text-[#1A1A1A]/50"
            }`}>
              {isOpen ? "● Currently Open to Customers" : "○ Currently Closed to Customers"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleOpen}
            disabled={togglingOpen}
            className={`inline-flex w-full md:w-auto justify-center items-center gap-2 border-2 px-6 py-3 font-mono text-[11px] font-black uppercase tracking-[0.15em] transition-colors disabled:opacity-50 ${
              isOpen
                ? "border-[#1A1A1A] bg-[#1A1A1A] text-white hover:bg-[#EC008C]"
                : "border-[#1A1A1A] bg-white text-[#1A1A1A] hover:bg-[#00FFFF]"
            }`}
          >
            {togglingOpen
              ? <><Loader2 size={15} className="animate-spin" /> Updating…</>
              : isOpen
                ? <><Power size={15} /> Close Shop</>
                : <><Power size={15} /> Open Shop</>
            }
          </button>
        </div>

        {/* ── Business Details & QR (Grouped) ── */}
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Left Column: Text Fields */}
          <div className="space-y-4">
            <h3 className="font-black uppercase tracking-tighter text-xl mb-4 border-b-2 border-[#1A1A1A]/10 pb-2">Business Details</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {FIELDS.map(({ key, label, type, placeholder }) => (
                <div key={key} className={type === "area" ? "md:col-span-2" : ""}>
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
                  ) : key === "address" ? (
                    <div className="flex gap-2">
                      <input
                        id={`field-${key}`}
                        type={type}
                        value={form[key]}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={placeholder}
                        className={`${inputClass} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={geocodeAddress}
                        className="inline-flex items-center justify-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#00FFFF] hover:text-[#1A1A1A] whitespace-nowrap"
                      >
                        <MapPin size={14} /> Pin Map
                      </button>
                    </div>
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

            <div className="mt-4 border-2 border-[#1A1A1A]/15 bg-[#F9F9F7] p-4">
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
          </div>

          {/* Right Column: QR Payment Image */}
          <div className="space-y-4">
            <h3 className="font-black uppercase tracking-tighter text-xl mb-4 border-b-2 border-[#1A1A1A]/10 pb-2">Payment Details</h3>
            <label className={fieldLabelClass}>
              <span className="inline-flex items-center gap-2"><QrCode size={13} />QR Code for Payment</span>
            </label>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-gray-500 mb-3 leading-relaxed">
              Upload your GCash / Maya / bank QR image. Customers will see this when paying.
            </p>

            <div className="space-y-3">
              {qrPreview ? (
                <div className="flex flex-col gap-4 rounded border-2 border-[#1A1A1A]/15 bg-[#F9F9F7] p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="mx-auto shrink-0 overflow-hidden border-4 border-[#1A1A1A] bg-white w-full max-w-[200px]" style={{ aspectRatio: "9/16" }}>
                    <img
                      src={qrPreview}
                      alt="QR code preview"
                      className="h-full w-full object-cover"
                      onError={() => setQrPreview(null)}
                    />
                  </div>
                  <div className="flex flex-col gap-2 border-t-2 border-[#1A1A1A]/10 pt-3">
                    <div className="flex flex-col text-center">
                      {qrFile ? (
                        <>
                          <span className="truncate font-black uppercase tracking-tight text-[#1A1A1A]">{qrFile.name}</span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#666]">
                            {(qrFile.size / 1024).toFixed(0)} KB · {qrFile.type.split("/")[1].toUpperCase()}
                          </span>
                        </>
                      ) : (
                        <span className="font-black uppercase tracking-tight text-[#1A1A1A]">Current QR code</span>
                      )}
                    </div>
                    <div className="flex gap-2 justify-center mt-1">
                      <button
                        type="button"
                        onClick={() => qrInputRef.current?.click()}
                        className="inline-flex flex-1 items-center justify-center gap-1 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-2 py-1.5 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#00FFFF] hover:text-[#1A1A1A]"
                      >
                        <UploadCloud size={12} /> Change
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveQr}
                        className="inline-flex flex-1 items-center justify-center gap-1 border-2 border-[#1A1A1A] bg-white px-2 py-1.5 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-[#1A1A1A] transition-colors hover:bg-[#EC008C] hover:text-white"
                      >
                        <X size={12} /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`cursor-pointer rounded border-4 border-dashed px-4 py-12 text-center transition-colors ${qrDragOver ? "border-[#00FFFF] bg-[#EFFFFF]" : "border-[#1A1A1A]/20 bg-[#F9F9F7] hover:border-[#EC008C]"}`}
                  onDragOver={(e) => { e.preventDefault(); setQrDragOver(true); }}
                  onDragLeave={() => setQrDragOver(false)}
                  onDrop={handleQrDrop}
                  onClick={() => qrInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && qrInputRef.current?.click()}
                  aria-label="Upload QR code"
                >
                  {qrDragOver
                    ? <UploadCloud size={32} className="mx-auto mb-2 text-[#00FFFF]" />
                    : <QrCode size={32} className="mx-auto mb-2 text-[#999]" />
                  }
                  <p className="font-black uppercase tracking-tight text-[#1A1A1A] text-sm">
                    {qrDragOver ? "Drop to upload" : "Upload QR Image"}
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#666]">
                    Drag &amp; drop or <span className="font-black text-[#EC008C]">browse files</span>
                  </p>
                </div>
              )}

              <input
                ref={qrInputRef}
                id="qr-file-input"
                type="file"
                accept={ALLOWED.join(",")}
                onChange={handleQrFileInput}
                className="hidden"
              />

              {qrError && (
                <div className="mt-2 inline-flex items-center gap-2 border-2 border-[#EC008C] bg-[#FFF4FA] px-3 py-2 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-[#EC008C] w-full">
                  <AlertCircle size={12} /> {qrError}
                </div>
              )}
              {qrUploading && (
                <div className="mt-2 inline-flex items-center gap-2 border-2 border-[#1A1A1A]/15 bg-[#F9F9F7] px-3 py-2 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-[#666] w-full">
                  <Loader2 size={12} className="animate-spin" /> Uploading QR...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Location Picker (Bottom) ── */}
        <div className="pt-6 border-t-2 border-[#1A1A1A]/10">
          <label className={fieldLabelClass}>Store Location (Map)</label>
          <p className="text-xs text-gray-500 mb-4">Click on the map to accurately place your store. This keeps your address field above perfectly synced.</p>
          <LocationPicker
            lat={form.lat}
            lng={form.lng}
            onChange={(lat, lng) => {
              setForm(f => ({ ...f, lat, lng }));
              reverseGeocode(lat, lng);
            }}
          />
        </div>

        {/* Save button (Only visible if form is dirty) */}
        {isDirty && (
          <div className="flex justify-end border-t-4 border-[#1A1A1A] pt-6 mt-8">
            <button
              type="submit"
              className="inline-flex items-center gap-2 border-4 border-[#1A1A1A] bg-[#00FFFF] px-8 py-4 font-mono text-[12px] font-black uppercase tracking-[0.18em] text-[#1A1A1A] transition-all hover:bg-[#EC008C] hover:text-white hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isBusy}
            >
              {isBusy
                ? <><Loader2 size={18} className="animate-spin" /> {(logoUploading || qrUploading) ? "Uploading..." : "Saving Profile..."}</>
                : <><Save size={18} /> Save Shop Profile</>
              }
            </button>
          </div>
        )}
        </form>
      </section>
    </main>
  );
}
