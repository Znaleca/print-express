"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";
import { normalizePhilippinePhone, toPhilippinePhoneInput } from "@/lib/phone";
import {
  Store, Save, Loader2, UploadCloud, QrCode, Power, MapPin, MapPinned,
  CheckCircle2, ShieldCheck, Phone, Mail, Globe2, ExternalLink, Info, Clock, RotateCcw
} from "lucide-react";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });

const BUCKET = "shop-logos";
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_DAY = (day_of_week) => ({ day_of_week, configured: false, is_closed: false, opens_at: "09:00", closes_at: "17:00" });

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
  const [hours, setHours] = useState(DAY_NAMES.map((_, day) => DEFAULT_DAY(day)));
  const [initialHours, setInitialHours] = useState(DAY_NAMES.map((_, day) => DEFAULT_DAY(day)));
  const [timezone, setTimezone] = useState("Asia/Manila");
  const [initialTimezone, setInitialTimezone] = useState("Asia/Manila");
  const [manualOverride, setManualOverride] = useState(null);
  const [initialManualOverride, setInitialManualOverride] = useState(null);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [phoneTouched, setPhoneTouched] = useState(false);

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
        .select("id, name, description, products_summary, address, phone, email, website, logo_url, qr_url, lat, lng, min_downpayment_percent, is_open, timezone, manual_open_override")
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
          phone: toPhilippinePhoneInput(biz.phone || ""),
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
        setTimezone(biz.timezone || "Asia/Manila");
        setInitialTimezone(biz.timezone || "Asia/Manila");
        setManualOverride(biz.manual_open_override ?? null);
        setInitialManualOverride(biz.manual_open_override ?? null);

        const { data: savedHours } = await supabase
          .from("business_hours")
          .select("id, business_id, day_of_week, opens_at, closes_at, is_closed")
          .eq("business_id", biz.id)
          .order("day_of_week");
        const nextHours = DAY_NAMES.map((_, day) => {
          const saved = (savedHours || []).find((row) => row.day_of_week === day);
          return saved
            ? { ...DEFAULT_DAY(day), ...saved, configured: true, opens_at: saved.opens_at?.slice(0, 5) || "09:00", closes_at: saved.closes_at?.slice(0, 5) || "17:00" }
            : DEFAULT_DAY(day);
        });
        setHours(nextHours);
        setInitialHours(nextHours);
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
      .update({ is_open: next, manual_open_override: next, manual_override_until: null })
      .eq("id", businessId);

    setTogglingOpen(false);
    if (err) {
      alert("Failed to update status: " + err.message);
    } else {
      setIsOpen(next);
      setManualOverride(next);
      setInitialManualOverride(next);
    }
  };

  const handleResumeSchedule = async () => {
    if (!businessId || togglingOpen) return;
    setTogglingOpen(true);
    const { error: err } = await supabase
      .from("businesses")
      .update({ is_open: true, manual_open_override: null, manual_override_until: null })
      .eq("id", businessId);

    if (!err) {
      const { data: effectiveOpen } = await supabase.rpc("is_business_open_now", { p_business_id: businessId });
      setIsOpen(Boolean(effectiveOpen));
      setManualOverride(null);
      setInitialManualOverride(null);
    }
    setTogglingOpen(false);
    if (err) alert("Failed to resume schedule: " + err.message);
  };

  const updateDay = (day, patch) => {
    setHours((current) => current.map((row) => row.day_of_week === day ? { ...row, ...patch } : row));
  };

  const saveOperatingHours = async () => {
    if (!businessId) return;
    setHoursSaving(true);
    try {
      const { error: timezoneError } = await supabase
        .from("businesses")
        .update({ timezone: timezone || "Asia/Manila" })
        .eq("id", businessId);
      if (timezoneError) throw timezoneError;

      const rowsToSave = hours
        .filter((row) => row.configured)
        .map((row) => ({
          business_id: businessId,
          day_of_week: row.day_of_week,
          opens_at: row.is_closed ? null : row.opens_at,
          closes_at: row.is_closed ? null : row.closes_at,
          is_closed: row.is_closed,
          updated_at: new Date().toISOString(),
        }));

      if (rowsToSave.length > 0) {
        const { error: upsertError } = await supabase
          .from("business_hours")
          .upsert(rowsToSave, { onConflict: "business_id,day_of_week" });
        if (upsertError) throw upsertError;
      }

      const removedDays = initialHours
        .filter((row) => row.configured && !hours.find((next) => next.day_of_week === row.day_of_week)?.configured)
        .map((row) => row.day_of_week);
      if (removedDays.length > 0) {
        const { error: deleteError } = await supabase
          .from("business_hours")
          .delete()
          .eq("business_id", businessId)
          .in("day_of_week", removedDays);
        if (deleteError) throw deleteError;
      }

      setInitialHours(hours);
      setInitialTimezone(timezone);
      showToast("Operating hours saved.");
    } catch (error) {
      showToast(error.message || "Could not save operating hours.", "error");
      throw error;
    } finally {
      setHoursSaving(false);
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({
      ...p,
      [name]: name === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value,
    }));
    if (name === "phone") setPhoneTouched(true);
  };

  const hasUnsavedChanges = Boolean(initialForm) && (
    JSON.stringify(form) !== JSON.stringify(initialForm)
    || Boolean(logoFile)
    || Boolean(qrFile)
    || JSON.stringify(hours) !== JSON.stringify(initialHours)
    || timezone !== initialTimezone
    || manualOverride !== initialManualOverride
  );

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
      const normalizedPhone = form.phone ? normalizePhilippinePhone(form.phone) : "";
      if (form.phone && !normalizedPhone) {
        setPhoneTouched(true);
        showToast("Enter the 10 digits after +63. Example: 9459759016.", "error");
        setSaving(false);
        return;
      }

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
        phone: normalizedPhone,
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

      const savedForm = {
        ...form,
        phone: normalizedPhone,
        logo_url: finalLogoUrl,
        qr_url: finalQrUrl,
        min_downpayment_percent: minDp,
      };
      setForm(savedForm);
      setInitialForm(savedForm);
      await saveOperatingHours();
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

  const phoneError = phoneTouched && form.phone && !normalizePhilippinePhone(form.phone)
    ? form.phone.startsWith("9")
      ? "Enter all 10 digits of the shop mobile number."
      : "Your number must start with 9. Example: 9459759016."
    : "";

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
    <main data-tour="owner-shop-profile" className="owner-shop-page min-h-screen bg-[#F6F6F2] pb-20 font-sans text-slate-900">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white px-4 pb-7 pt-8 sm:px-8 sm:pb-8 sm:pt-10 lg:px-10">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border border-[#00AFC0]/15" />
        <div className="relative mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#EC008C]">Storefront settings</p>
            <h1 className="mt-2 text-4xl font-black uppercase leading-[0.9] tracking-tight sm:text-6xl">
              My shop<span className="text-[#00AFC0]">.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
              Keep your public profile, customer contact details, payment QR, and shop location accurate.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-[#F6F6F2] p-2 shadow-sm">
            <div className="flex items-center gap-2 px-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isOpen ? "bg-emerald-500" : "bg-slate-400"}`} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Store status</p>
                <p className="text-xs font-bold text-slate-800">{isOpen ? "Visible to customers" : "Temporarily closed"}</p>
              </div>
            </div>
            <button
              data-tour="owner-shop-status"
              type="button"
              onClick={handleToggleOpen}
              disabled={togglingOpen}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-black transition-colors disabled:opacity-60 ${
                isOpen ? "bg-[#00FFFF] text-[#1A1A1A] hover:bg-[#FFF200]" : "bg-slate-900 text-white hover:bg-[#EC008C]"
              }`}
            >
              <Power size={14} /> {isOpen ? "Open" : "Closed"}
            </button>
          </div>
        </div>
      </section>

      {toast && (
        <div className={`fixed bottom-5 left-4 right-4 z-[200] flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg sm:left-auto sm:right-6 ${
          toast.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          <CheckCircle2 size={16} /> {toast.msg}
        </div>
      )}

      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-8 sm:pt-8 lg:px-10">
        <form onSubmit={handleSubmit}>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-6">
              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Store hours</p>
                    <h2 className="mt-1 text-xl font-black text-slate-900">When customers can order</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Set a weekly schedule or leave a day unconfigured to follow your manual shop status.</p>
                  </div>
                  <Clock size={20} className="text-[#00AFC0]" />
                </div>

                <div className="mt-5 grid gap-2">
                  {hours.map((row) => (
                    <div key={row.day_of_week} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#F9F9F7] p-3 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                      <label className="flex items-center gap-2 text-xs font-black text-slate-800">
                        <input
                          type="checkbox"
                          checked={row.configured}
                          onChange={(event) => updateDay(row.day_of_week, { configured: event.target.checked })}
                          className="h-4 w-4 accent-[#EC008C]"
                        />
                        {DAY_NAMES[row.day_of_week]}
                      </label>
                      {row.configured ? (
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                          Opens
                          <input
                            type="time"
                            value={row.opens_at}
                            disabled={row.is_closed}
                            onChange={(event) => updateDay(row.day_of_week, { opens_at: event.target.value })}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#00AFC0] disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </label>
                      ) : <span className="text-[11px] text-slate-400 sm:col-span-2">No schedule configured</span>}
                      {row.configured && (
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                          Closes
                          <input
                            type="time"
                            value={row.closes_at}
                            disabled={row.is_closed}
                            onChange={(event) => updateDay(row.day_of_week, { closes_at: event.target.value })}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#00AFC0] disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </label>
                      )}
                      {row.configured && (
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                          <input
                            type="checkbox"
                            checked={row.is_closed}
                            onChange={(event) => updateDay(row.day_of_week, { is_closed: event.target.checked })}
                            className="h-4 w-4 accent-[#EC008C]"
                          />
                          Closed
                        </label>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#00AFC0]/25 bg-[#00FFFF]/[0.06] p-4 sm:flex-row sm:items-end sm:justify-between">
                  <label className="block max-w-xs">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Shop timezone</span>
                    <select
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#00AFC0]"
                    >
                      <option value="Asia/Manila">Asia/Manila (Philippine Time)</option>
                      <option value="Asia/Singapore">Asia/Singapore</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </label>
                  <div className="text-left sm:text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Manual status</p>
                    <p className="mt-1 text-xs font-bold text-slate-800">{manualOverride === null ? "Following schedule" : manualOverride ? "Forced open" : "Forced closed"}</p>
                    {manualOverride !== null && (
                      <button type="button" onClick={handleResumeSchedule} disabled={togglingOpen} className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#C40075] hover:underline disabled:opacity-50">
                        <RotateCcw size={12} /> Resume schedule
                      </button>
                    )}
                  </div>
                </div>
                {hoursSaving && <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#C40075]">Saving hours...</p>}
              </section>

              <section className="overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white shadow-sm">
                <div className="cmyk-bar-sm" />
                <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">01 / Identity</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Make your shop recognizable</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">This name and logo are used across your storefront, orders, and customer messages.</p>
                </div>
                <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[190px_minmax(0,1fr)] lg:items-center">
                  <div className="flex flex-col items-center gap-3">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Shop logo preview" className="h-36 w-36 rounded-2xl border border-[#D8D6CE] bg-white object-contain p-2 shadow-sm" />
                    ) : (
                      <div className="flex h-36 w-36 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-[#F6F6F2] text-slate-400">
                        <Store size={38} />
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoSelected(e.target.files?.[0])}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving || logoUploading}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C] disabled:opacity-50"
                    >
                      <UploadCloud size={14} /> {logoUploading ? "Uploading..." : "Change logo"}
                    </button>
                    <p className="text-center text-[10px] leading-relaxed text-slate-400">PNG, JPG, or WebP<br />Optimized on upload</p>
                    {logoError && <p className="text-center text-[11px] font-medium text-rose-600">{logoError}</p>}
                  </div>

                  <div>
                    <label htmlFor="shop-name" className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Business name</label>
                    <input
                      id="shop-name"
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="e.g. Apex Print Studio"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] px-4 py-3.5 text-sm font-semibold outline-none transition-colors focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/40"
                    />
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
                      <Info size={13} className="mt-0.5 shrink-0 text-[#00AFC0]" />
                      Use the name customers will recognize on receipts and order updates.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-7">
                <div className="border-b border-slate-100 pb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">02 / Public profile</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Tell customers what you do</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">These sections are reviewed and managed through your business documents.</p>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {[
                    ["Business background", "description", "A short overview of your shop", "Tell customers when you started, what you specialize in, and what makes your shop reliable."],
                    ["Products & services", "products_summary", "What customers can order", "Business cards, flyers, posters, tarpaulins, stickers, photo printing, and rush orders."],
                  ].map(([label, key, helper, fallback]) => (
                    <div key={key} className="rounded-2xl border border-slate-200 bg-[#F9F9F7] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-slate-800">{label}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{helper}</p>
                        </div>
                        <ShieldCheck size={16} className="shrink-0 text-[#00AFC0]" />
                      </div>
                      <p className={`mt-4 min-h-24 text-xs leading-relaxed ${form[key] ? "text-slate-700" : "italic text-slate-400"}`}>
                        {form[key] || fallback}
                      </p>
                      <p className="mt-3 border-t border-slate-200 pt-3 text-[10px] leading-relaxed text-slate-400">
                        Read-only after submission. Request changes from the <Link href="/owner/documents" className="font-bold text-[#C40075] hover:underline">Documents</Link> page.
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-7">
                <div className="border-b border-slate-100 pb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">03 / Contact</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">How customers can reach you</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Keep these details current so customers know where to ask questions.</p>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Phone number</span>
                    <span className={`mt-2 flex overflow-hidden rounded-2xl border bg-[#F6F6F2] transition-colors focus-within:ring-2 ${
                      phoneError
                        ? "border-rose-500 focus-within:border-rose-500 focus-within:ring-rose-200"
                        : "border-slate-200 focus-within:border-[#00AFC0] focus-within:bg-white focus-within:ring-[#00FFFF]/40"
                    }`}>
                      <span className="flex items-center gap-2 border-r border-slate-200 bg-slate-100 px-3.5 text-sm font-bold text-slate-700" aria-hidden="true">
                        <Phone size={15} className="text-[#EC008C]" />
                        +63
                      </span>
                      <input
                        type="tel"
                        name="phone"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={10}
                        pattern="[0-9]*"
                        value={form.phone}
                        onBlur={() => setPhoneTouched(true)}
                        onChange={handleChange}
                        placeholder="9459759016"
                        aria-label="Shop mobile number without country code"
                        aria-invalid={Boolean(phoneError)}
                        aria-describedby="shop-phone-help shop-phone-error"
                        className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm outline-none"
                      />
                    </span>
                    <span id="shop-phone-help" className="mt-1 block text-[11px] text-slate-500">Optional · enter 10 digits after +63. We save the complete number for customers.</span>
                    {phoneError && (
                      <span id="shop-phone-error" role="alert" className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-700">
                        <Info size={14} aria-hidden="true" />
                        {phoneError}
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Business email</span>
                    <span className="relative mt-2 block">
                      <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#EC008C]" />
                      <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="contact@yourshop.com" className="w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] py-3.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/40" />
                    </span>
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Website URL <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span></span>
                    <span className="relative mt-2 block">
                      <Globe2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#EC008C]" />
                      <input type="url" name="website" value={form.website} onChange={handleChange} placeholder="https://yourshop.com" className="w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] py-3.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/40" />
                    </span>
                  </label>
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">04 / Location</p>
                    <h2 className="mt-1 text-xl font-black text-slate-900">Help customers find you</h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">Add a clear address and place the marker at your shop entrance.</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[10px] font-bold ${form.lat && form.lng ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    <MapPin size={12} /> {form.lat && form.lng ? "Map pin ready" : "Map pin needed"}
                  </span>
                </div>
                <label className="mt-5 block">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Address</span>
                  <input type="text" name="address" value={form.address} onChange={handleChange} placeholder="e.g. 123 Main St, City" className="mt-2 w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/40" />
                </label>
                <div className="mt-5 overflow-hidden rounded-2xl border border-[#D8D6CE] bg-[#ECECE8]">
                  <div className="flex items-center gap-2 border-b border-[#D8D6CE] bg-white px-4 py-3 text-xs font-bold text-slate-700">
                    <MapPinned size={15} className="text-[#00AFC0]" /> Drag the marker or click the map to adjust it.
                  </div>
                  <div className="relative h-[340px] sm:h-[420px]">
                    <LocationPicker
                      lat={form.lat}
                      lng={form.lng}
                      onChange={(lat, lng) => setForm((p) => ({ ...p, lat, lng }))}
                    />
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-6 xl:sticky xl:top-6">
              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Customer view</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">Your storefront preview</h2>
                  </div>
                  <Store size={20} className="text-[#00AFC0]" />
                </div>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-[#F6F6F2] p-4">
                  <div className="flex items-center gap-3">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Preview logo" className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-contain p-1" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-[#00FFFF]"><Store size={22} /></div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{form.name || "Your shop name"}</p>
                      <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold ${isOpen ? "text-emerald-700" : "text-slate-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-emerald-500" : "bg-slate-400"}`} /> {isOpen ? "Open for orders" : "Currently closed"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-[11px] text-slate-600">
                    <p className="flex items-start gap-2"><MapPin size={13} className="mt-0.5 shrink-0 text-[#EC008C]" /> <span>{form.address || "Add your shop address"}</span></p>
                    <p className="flex items-center gap-2"><Phone size={13} className="shrink-0 text-[#EC008C]" /> <span>{normalizePhilippinePhone(form.phone) || "Add a contact number"}</span></p>
                  </div>
                </div>
                <Link href="/browse" className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#C40075] hover:underline">
                  <ExternalLink size={14} /> View customer marketplace
                </Link>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Payments</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">Payment QR code</h2>
                  </div>
                  <QrCode size={20} className="text-[#00AFC0]" />
                </div>
                <div className="mt-4 flex items-center gap-4 rounded-2xl border border-slate-200 bg-[#F6F6F2] p-3">
                  {qrPreview ? (
                    <img src={qrPreview} alt="Payment QR code preview" className="h-28 w-28 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
                  ) : (
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400"><QrCode size={34} /></div>
                  )}
                  <div className="min-w-0">
                    <input ref={qrInputRef} type="file" accept="image/*" onChange={(e) => handleQrSelected(e.target.files?.[0])} className="hidden" />
                    <button type="button" onClick={() => qrInputRef.current?.click()} disabled={saving || qrUploading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C] disabled:opacity-50">
                      <UploadCloud size={14} /> {qrUploading ? "Uploading..." : "Change QR"}
                    </button>
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-400">GCash or Maya QR image.<br />Customers can use it at checkout.</p>
                    {qrError && <p className="mt-1 text-[11px] font-medium text-rose-600">{qrError}</p>}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Checkout settings</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">Downpayment policy</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">Set the minimum percentage customers must pay before production starts.</p>
                <div className="mt-4 flex items-center gap-2">
                  <input type="number" min="1" max="100" name="min_downpayment_percent" value={form.min_downpayment_percent} onChange={handleChange} className="w-24 rounded-xl border border-slate-200 bg-[#F6F6F2] px-3 py-3 text-sm font-black outline-none focus:border-[#EC008C] focus:bg-white focus:ring-2 focus:ring-[#EC008C]/20" />
                  <span className="text-sm font-black text-slate-500">%</span>
                </div>
              </section>

              <section className="rounded-3xl border-2 border-slate-900 bg-slate-900 p-5 text-white shadow-[6px_6px_0_rgba(0,255,255,0.8)]">
                <div className="flex items-center gap-2">
                  <Save size={17} className="text-[#00FFFF]" />
                  <p className="text-sm font-black">Save your storefront</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">Changes are not visible to customers until you save them.</p>
                <p className={`mt-4 text-[10px] font-black uppercase tracking-[0.16em] ${hasUnsavedChanges ? "text-[#FFF200]" : "text-white/45"}`}>
                  {hasUnsavedChanges ? "Unsaved changes" : "Everything is up to date"}
                </p>
                <button type="submit" disabled={saving || !hasUnsavedChanges} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00FFFF] px-4 py-3.5 text-xs font-black text-slate-900 transition-colors hover:bg-[#FFF200] disabled:cursor-not-allowed disabled:opacity-45">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? "Saving changes..." : "Save changes"}
                </button>
              </section>
            </aside>
          </div>
        </form>
      </section>
    </main>
  );
}
