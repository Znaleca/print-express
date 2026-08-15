"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";
import {
  Store, Save, Loader2, CheckCircle, AlertCircle,
  UploadCloud, ImageOff, X, Printer, QrCode, Power, MapPin, CheckCircle2, ShieldCheck
} from "lucide-react";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });

const FIELDS = [
  { key: "name", label: "Business Name", type: "text", placeholder: "e.g. Apex Print Studio" },
  { key: "description", label: "Business Background", type: "area", placeholder: "Tell customers when you started, what you specialize in, and what makes your shop reliable...", maxLength: 800 },
  { key: "products_summary", label: "Products & Services Offered", type: "area", placeholder: "e.g. Business cards, flyers, posters, tarpaulins, stickers, photo printing, and rush orders...", maxLength: 500 },
  { key: "phone", label: "Phone Number", type: "text", placeholder: "+63 912 345 6789" },
  { key: "email", label: "Business Email", type: "email", placeholder: "contact@yourshop.com" },
  { key: "website", label: "Website URL", type: "url", placeholder: "https://yourshop.com" },
];

const ADMIN_MANAGED_PROFILE_FIELDS = new Set(["description", "products_summary"]);

const BUCKET = "shop-logos";
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function ShopProfilePage() {
  const [form, setForm] = useState({
    name: "", description: "", products_summary: "", address: "",
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
  const fileInputRef = useRef(null);

  // QR upload state
  const [qrPreview, setQrPreview] = useState(null);
  const [qrFile, setQrFile] = useState(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const qrInputRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, description, products_summary, address, phone, email, website, logo_url, qr_url, lat, lng, min_downpayment_percent, is_open")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (biz) {
        setBusinessId(biz.id);
        const loadedForm = {
          name: biz.name || "",
          description: biz.description || "",
          products_summary: biz.products_summary || "",
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

  const handleToggleOpen = async () => {
    if (!businessId || togglingOpen) return;
    const next = !isOpen;
    setTogglingOpen(true);

    const { error: err } = await supabase
      .from("businesses")
      .update({ is_open: next })
      .eq("id", businessId);

    setTogglingOpen(false);
    if (err) {
      alert("Failed to update status: " + err.message);
    } else {
      setIsOpen(next);
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleLogoSelected = async (file) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setLogoError("Supported formats: PNG, JPG, or WebP.");

    try {
      const optimized = await optimizeImageForUpload(file);
      setLogoError(null);
      setLogoFile(optimized);
      setLogoPreview(URL.createObjectURL(optimized));
    } catch (error) {
      setLogoError(error.message || "Could not optimize this image.");
    }
  };

  const handleQrSelected = async (file) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setQrError("Supported formats: PNG, JPG, or WebP.");

    try {
      const optimized = await optimizeImageForUpload(file);
      setQrError(null);
      setQrFile(optimized);
      setQrPreview(URL.createObjectURL(optimized));
    } catch (error) {
      setQrError(error.message || "Could not optimize this image.");
    }
  };

  const uploadFileToBucket = async (file, prefix) => {
    const optimized = await optimizeImageForUpload(file);
    const ext = getUploadExtension(optimized);
    const fileName = `${businessId}/${prefix}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(fileName, optimized, {
        upsert: true,
        cacheControl: "31536000",
        contentType: optimized.type,
      });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from(IMAGE_BUCKET)
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!businessId) return;
    setSaving(true);

    try {
      let finalLogoUrl = form.logo_url;
      let finalQrUrl = form.qr_url;

      if (logoFile) {
        setLogoUploading(true);
        finalLogoUrl = await uploadFileToBucket(logoFile, "logo");
        setLogoUploading(false);
      }

      if (qrFile) {
        setQrUploading(true);
        finalQrUrl = await uploadFileToBucket(qrFile, "qr");
        setQrUploading(false);
      }

      const parsedDp = Number.parseInt(String(form.min_downpayment_percent), 10);
      const minDp = Number.isFinite(parsedDp) ? Math.min(100, Math.max(1, parsedDp)) : 30;

      const payload = {
        name: form.name,
        description: form.description,
        products_summary: form.products_summary,
        address: form.address,
        phone: form.phone,
        email: form.email,
        website: form.website,
        logo_url: finalLogoUrl,
        qr_url: finalQrUrl,
        lat: form.lat,
        lng: form.lng,
        min_downpayment_percent: minDp,
      };

      const { error: err } = await supabase
        .from("businesses")
        .update(payload)
        .eq("id", businessId);

      if (err) throw err;

      setForm((p) => ({ ...p, logo_url: finalLogoUrl, qr_url: finalQrUrl, min_downpayment_percent: minDp }));
      setInitialForm(payload);
      setLogoFile(null);
      setQrFile(null);
      showToast("Shop profile updated successfully.");

    } catch (err) {
      showToast(err.message || "Failed to save profile.", "error");
    } finally {
      setSaving(false);
      setLogoUploading(false);
      setQrUploading(false);
    }
  };

  if (loading) {
    return (
      <main className="owner-shop-page min-h-screen bg-[#F6F6F2] flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading shop settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="owner-shop-page min-h-screen bg-[#F6F6F2] font-sans text-slate-900 pb-20">
      
      {/* Header Banner */}
      <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-10 pt-8 text-white sm:px-8 sm:pb-12 sm:pt-10 lg:px-10">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
        <div className="relative mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">My shop</h1>
            <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">Keep your storefront, contact details, payment instructions, and map pin ready for customers.</p>
          </div>

          {/* Open/Closed Toggle Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleOpen}
              disabled={togglingOpen}
              className={`flex items-center gap-2 rounded-full px-5 py-3 text-xs font-black transition-all shadow-md ${
                isOpen ? "bg-[#00FFFF] text-[#1A1A1A] hover:bg-[#FFF200]" : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-[#EC008C]"
              }`}
            >
              <Power size={14} /> {isOpen ? "Shop is Open" : "Shop is Closed"}
            </button>
          </div>
        </div>
      </section>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-xl border text-xs font-semibold shadow-lg flex items-center gap-2 ${
          toast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
        }`}>
          <CheckCircle2 size={16} /> {toast.msg}
        </div>
      )}

      {/* Form Container */}
      <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-8 lg:px-10">
        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Logo & QR Code Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Logo Upload Card */}
            <div className="relative overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm sm:p-8">
              <div className="cmyk-bar-sm absolute left-0 right-0 top-0" />
              <h2 className="mb-5 text-lg font-black text-slate-900">Storefront identity</h2>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-28 w-28 shrink-0 rounded-2xl border border-[#D8D6CE] object-cover" />
                ) : (
                  <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-[#D8D6CE] bg-[#ECECE8] text-slate-400">
                    <Store size={34} />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleLogoSelected(e.target.files[0])}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-1 rounded-full bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C]"
                  >
                    Select Logo Image
                  </button>
                  <p className="text-[11px] text-slate-400">PNG, JPG, WebP · optimized to 5MB max</p>
                  {logoError && <p className="text-xs text-rose-600 font-medium mt-1">{logoError}</p>}
                </div>
              </div>
            </div>

            {/* QR Code Upload Card */}
            <div className="relative overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm sm:p-8">
              <div className="cmyk-bar-sm absolute left-0 right-0 top-0" />
              <h2 className="mb-5 text-lg font-black text-slate-900">Payment details</h2>
              <div className="flex items-center gap-4">
                {qrPreview ? (
                  <img src={qrPreview} alt="QR Code" className="h-28 w-28 shrink-0 rounded-2xl border border-[#D8D6CE] object-cover" />
                ) : (
                  <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-[#D8D6CE] bg-[#ECECE8] text-slate-400">
                    <QrCode size={34} />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={qrInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleQrSelected(e.target.files[0])}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => qrInputRef.current?.click()}
                    className="mb-1 rounded-full bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C]"
                  >
                    Select QR Image
                  </button>
                  <p className="text-[11px] text-slate-400">GCash / Maya QR image · optimized to 5MB max</p>
                  {qrError && <p className="text-xs text-rose-600 font-medium mt-1">{qrError}</p>}
                </div>
              </div>
            </div>

          </div>

          {/* Business Information Fields */}
          <div className="space-y-5 rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm sm:p-8">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-900">Business information</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                Give customers a quick, honest overview of your shop. Your background and product summary appear on your public profile.
              </p>
            </div>

            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{f.label}</label>
                {f.type === "area" ? (
                  <>
                    {ADMIN_MANAGED_PROFILE_FIELDS.has(f.key) ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
                        {form[f.key] || "Not provided yet."}
                      </div>
                    ) : (
                      <textarea
                        name={f.key}
                        value={form[f.key]}
                        onChange={handleChange}
                        rows={3}
                        placeholder={f.placeholder}
                        className="w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-[#00FFFF]"
                      />
                    )}
                    {(f.key === "description" || f.key === "products_summary") && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Read-only after submission · Request changes from the <Link href="/owner/documents" className="font-bold text-[#C40075] hover:underline">Documents</Link> page.
                      </p>
                    )}
                  </>
                ) : (
                  <input
                    type={f.type}
                    name={f.key}
                    value={form[f.key]}
                    onChange={handleChange}
                    placeholder={f.placeholder}
                    className="w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-[#00FFFF]"
                  />
                )}
              </div>
            ))}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Minimum Downpayment Percentage (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                name="min_downpayment_percent"
                value={form.min_downpayment_percent}
                onChange={handleChange}
                className="w-full max-w-xs rounded-2xl border border-slate-200 bg-[#F6F6F2] px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#EC008C]"
              />
              <p className="text-[11px] text-slate-400 mt-1">Default minimum downpayment required at checkout (e.g. 30%).</p>
            </div>
          </div>

          {/* Location Picker Map Card */}
          <div className="space-y-4 rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="border-b border-slate-100 pb-4 text-xl font-black text-slate-900">Location</h2>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address Text</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="e.g. 123 Main St, City"
                className="w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-[#00FFFF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Pin Map Location</label>
              <div className="relative h-[420px] overflow-hidden rounded-2xl border border-[#D8D6CE]">
                <LocationPicker
                  lat={form.lat}
                  lng={form.lng}
                  onChange={(lat, lng) => setForm((p) => ({ ...p, lat, lng }))}
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-full bg-[#1A1A1A] px-8 py-4 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#EC008C] disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Shop Profile
            </button>
          </div>

        </form>
      </section>

    </main>
  );
}
