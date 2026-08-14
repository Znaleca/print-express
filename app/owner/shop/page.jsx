"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import {
  Store, Save, Loader2, CheckCircle, AlertCircle,
  UploadCloud, ImageOff, X, Printer, QrCode, Power, MapPin, CheckCircle2, ShieldCheck
} from "lucide-react";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });

const FIELDS = [
  { key: "name", label: "Business Name", type: "text", placeholder: "e.g. Apex Print Studio" },
  { key: "description", label: "Description", type: "area", placeholder: "Describe your printing shop and available machinery..." },
  { key: "phone", label: "Phone Number", type: "text", placeholder: "+63 912 345 6789" },
  { key: "email", label: "Business Email", type: "email", placeholder: "contact@yourshop.com" },
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
    if (!ALLOWED.includes(file.type)) return setLogoError("Supported formats: PNG, JPG, WebP, SVG.");
    if (file.size > MAX_MB * 1024 * 1024) return setLogoError("Image must be under 2MB.");

    setLogoError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleQrSelected = async (file) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setQrError("Supported formats: PNG, JPG, WebP, SVG.");
    if (file.size > MAX_MB * 1024 * 1024) return setQrError("Image must be under 2MB.");

    setQrError(null);
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
  };

  const uploadFileToBucket = async (file, prefix) => {
    const ext = file.name.split(".").pop();
    const fileName = `${prefix}_${businessId}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("chat-images")
      .upload(fileName, file, { upsert: true });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from("chat-images")
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
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading shop settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      
      {/* Header Banner */}
      <section className="bg-white border-b border-slate-200 py-8 px-4 sm:px-6 lg:px-8 relative shadow-sm">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Shop Profile & Settings</h1>
            <p className="mt-1 text-xs text-slate-500">General business information lives here: contact details, shop description, map location, payment QR code, and open status.</p>
          </div>

          {/* Open/Closed Toggle Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleOpen}
              disabled={togglingOpen}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm ${
                isOpen ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-800 text-white hover:bg-slate-900"
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
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Logo & QR Code Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Logo Upload Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Shop Logo</h2>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-20 h-20 object-cover rounded-xl border border-slate-200 shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                    <Store size={28} />
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
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-colors mb-1"
                  >
                    Select Logo Image
                  </button>
                  <p className="text-[11px] text-slate-400">PNG, JPG, WebP up to 2MB</p>
                  {logoError && <p className="text-xs text-rose-600 font-medium mt-1">{logoError}</p>}
                </div>
              </div>
            </div>

            {/* QR Code Upload Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Downpayment Payment QR</h2>
              <div className="flex items-center gap-4">
                {qrPreview ? (
                  <img src={qrPreview} alt="QR Code" className="w-20 h-20 object-cover rounded-xl border border-slate-200 shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                    <QrCode size={28} />
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
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-colors mb-1"
                  >
                    Select QR Image
                  </button>
                  <p className="text-[11px] text-slate-400">GCash / Maya QR image</p>
                  {qrError && <p className="text-xs text-rose-600 font-medium mt-1">{qrError}</p>}
                </div>
              </div>
            </div>

          </div>

          {/* Business Information Fields */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">General Business Information</h2>

            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{f.label}</label>
                {f.type === "area" ? (
                  <textarea
                    name={f.key}
                    value={form[f.key]}
                    onChange={handleChange}
                    rows={3}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#00FFFF]"
                  />
                ) : (
                  <input
                    type={f.type}
                    name={f.key}
                    value={form[f.key]}
                    onChange={handleChange}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#00FFFF]"
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
                className="w-full max-w-xs px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#EC008C]"
              />
              <p className="text-[11px] text-slate-400 mt-1">Default minimum downpayment required at checkout (e.g. 30%).</p>
            </div>
          </div>

          {/* Location Picker Map Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Shop Address & Map Location</h2>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address Text</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="e.g. 123 Main St, City"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#00FFFF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Pin Map Location</label>
              <div className="h-[320px] rounded-xl border border-slate-200 overflow-hidden relative">
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
              className="px-8 py-3.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-[#EC008C] transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
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
